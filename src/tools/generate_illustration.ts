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
        const referenceImage = parseDataUrl(args.referenceImageUrl || args.heroImageUrl);
        const contents = referenceImage
            ? [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.data } }
                ]
            }]
            : prompt;

        const response = await ai.models.generateContent({
            // Failed to generate illustration: Error [ApiError]: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-2.5-flash-preview-image\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.5-flash-preview-image\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.5-flash-preview-image\nPlease retry in 1.357296117s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://ai.google.dev/gemini-api/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_input_token_count","quotaId":"GenerateContentInputTokensPerModelPerMinute-FreeTier","quotaDimensions":{"model":"gemini-2.5-flash-preview-image","location":"global"}},{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-2.5-flash-preview-image","location":"global"}},{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-2.5-flash-preview-image","location":"global"}}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"1s"}]}}
            // at async generateIllustration (src/tools/generate_illustration.ts:24:26) {
            //   status: 429
            // model: 'gemini-2.5-flash-image',

            // Failed to generate illustration: Error [ApiError]: {"error":{"code":404,"message":"models/imagen-4.0-fast-generate-001 is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.","status":"NOT_FOUND"}}
            // model: 'imagen-4.0-fast-generate-001',
            // model: 'imagen-4.0-generate-001',

            // model: 'gemini-3.1-flash-image-preview',
            model: 'gemini-2.5-flash-image', // This works after linking Billing to project
            // model: '',

            contents,
            config: {
                responseModalities: ['text', 'image'],
                imageConfig: {
                    aspectRatio: '1:1',
                    imageSize: '1K',
                },
            }
        });

        const inlineImage = response?.candidates?.[0]?.content?.parts?.find(
            (part) => part.inlineData?.data,
        )?.inlineData;
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
