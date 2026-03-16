/* eslint-disable */
// @ts-nocheck
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

const useLocal = process.env.USE_LOCAL_MOCKS === 'true' || !process.env.GCS_BUCKET_NAME;
const storage = useLocal ? null : new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'storybook-assets-dev'; // Need to be configured

function parseDataUrl(dataUrl?: string) {
    if (!dataUrl) return null;
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
}

function buildContents(prompt: string, referenceImageUrl?: string, heroImageUrl?: string) {
    const referenceImage = parseDataUrl(referenceImageUrl || heroImageUrl);
    return referenceImage
        ? [{
            role: 'user',
            parts: [
                { text: prompt },
                { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.data } }
            ]
        }]
        : prompt;
}

function extractInlineImage(response: any) {
    for (const candidate of response?.candidates || []) {
        for (const part of candidate?.content?.parts || []) {
            if (part?.inlineData?.data) {
                return part.inlineData;
            }
        }
    }
    return null;
}

async function requestIllustration(ai: GoogleGenAI, prompt: string, args: any) {
    return ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: buildContents(prompt, args.referenceImageUrl, args.heroImageUrl),
        config: {
            responseModalities: ['text', 'image'],
            imageConfig: {
                aspectRatio: '1:1',
                imageSize: '1K',
            },
        }
    });
}

export async function generateIllustration(args: any) {
    if (!args.prompt) return { error: "prompt is required" };

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        // Vertex AI / Google GenAI SDK call for Imagen 3
        // In this MVP, we assume the user's reference photo is stored in the session or passed in.
        // For simplicity we will just call Imagen 3 to generate a standard image first.
        // We will refine with Subject Reference (imagen-3.0-capability-001) later.

        console.log(`Generating illustration for: ${args.prompt}`);

        const prompt = args.prompt.replace(/^["'\s]+|["'\s]+$/g, '').trim();
        let response = await requestIllustration(ai, prompt, args);
        let inlineImage = extractInlineImage(response);
        if (!inlineImage?.data) {
            const responseText = (response?.candidates || [])
                .flatMap((candidate: any) => candidate?.content?.parts || [])
                .map((part: any) => part?.text)
                .filter(Boolean)
                .join(' ')
                .trim();
            console.warn('Image model returned no inline image on first attempt.', {
                prompt,
                hasReferenceImage: Boolean(args.referenceImageUrl || args.heroImageUrl),
                responseText: responseText.slice(0, 300),
            });

            const retryPrompt = `${prompt}\n\nReturn a new illustrated image for this scene. Do not reply with text only.`;
            response = await requestIllustration(ai, retryPrompt, args);
            inlineImage = extractInlineImage(response);
        }

        const imageData = inlineImage?.data;
        if (!imageData) throw new Error('No image generated');
        const mimeType = inlineImage?.mimeType || 'image/jpeg';
        const mimeExtension = mimeType.split('/')[1]?.split('+')[0];
        const overriddenExtension = {
            'jpeg': 'jpg',
        }[mimeExtension ?? ''] ?? mimeExtension;
        const extension = overriddenExtension || 'jpg';
        const imageBuffer = Buffer.from(imageData, 'base64');

        if (useLocal) {
            const publicUrl = `data:${mimeType};base64,${imageData}`;
            console.log(`Image generated and served as local data URI`);
            return { success: true, url: publicUrl };
        }

        // Upload to Cloud Storage
        const fileId = `${uuidv4()}.${extension}`;
        const bucket = storage!.bucket(bucketName);
        const file = bucket.file(`images/${fileId}`);
        await file.save(imageBuffer, { contentType: mimeType });

        const publicUrl = `https://storage.googleapis.com/${bucketName}/images/${fileId}`;
        console.log(`Image saved at: ${publicUrl}`);

        return { success: true, url: publicUrl };
    } catch (e: any) {
        console.error("Failed to generate illustration:", e);
        return { error: e.message };
    }
}
