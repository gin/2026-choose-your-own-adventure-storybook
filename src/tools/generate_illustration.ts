/* eslint-disable */
// @ts-nocheck
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

const useLocal = process.env.USE_LOCAL_MOCKS === 'true' || !process.env.GCS_BUCKET_NAME;
const storage = useLocal ? null : new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'storybook-assets-dev'; // Need to be configured

export async function generateIllustration(args: any) {
    if (!args.prompt) return { error: "prompt is required" };

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        // Vertex AI / Google GenAI SDK call for Imagen 3
        // In this MVP, we assume the user's reference photo is stored in the session or passed in.
        // For simplicity we will just call Imagen 3 to generate a standard image first.
        // We will refine with Subject Reference (imagen-3.0-capability-001) later.

        console.log(`Generating illustration for: ${args.prompt}`);

        const response = await ai.models.generateImages({
            model: 'gemini-2.5-flash-image',
            // model: 'imagen-3.0-generate-002',
            prompt: args.prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '4:3',
            }
        });
        const imageBase64 = response?.generatedImages?.[0]?.image?.imageBytes;
        if (!imageBase64) throw new Error("No image generated");
        const imageBuffer = Buffer.from(imageBase64, 'base64');

        if (useLocal) {
            const publicUrl = `data:image/jpeg;base64,${imageBase64}`;
            console.log(`Image generated and served as local data URI`);
            return { success: true, url: publicUrl };
        }

        // Upload to Cloud Storage
        const fileId = `${uuidv4()}.jpg`;
        const bucket = storage!.bucket(bucketName);
        const file = bucket.file(`images/${fileId}`);
        await file.save(imageBuffer, { contentType: 'image/jpeg' });

        const publicUrl = `https://storage.googleapis.com/${bucketName}/images/${fileId}`;
        console.log(`Image saved at: ${publicUrl}`);

        return { success: true, url: publicUrl };
    } catch (e: any) {
        console.error("Failed to generate illustration:", e);
        return { error: e.message };
    }
}
