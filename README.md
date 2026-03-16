# 2026-choose-your-own-adventure-storybook

## Tools Used
- IDE: Antigravity with Gemini 3.1 Pro
- Agent Skills:
    - UI: pbakaus/impeccable
- Terraform for infrastructure as code
- Next.js for frontend

## Google services used:
- GenAI SDK for multimodal live API for interruptible voice agent
- Vertex AI Imagen 4 (or Nano Banana) for personalized illustrations
- Google Cloud Storage and Firestore for data persistence and state management
- Google Cloud Run for hosting the app

## Note
For image generation, you need to link your Google Cloud project to a billing account.
The current model is set to `gemini-2.5-flash-image` (aka Nano Banana) to keep costs low.
Set to `imagen-4.0-fast-generate-001` in `tools/generate_illustrations.ts` for better quality.

## Testing Locally
To run and test the storybook locally before deploying:
1. Get a Gemini API key from Google AI Studio or Vertex AI  
    - https://aistudio.google.com/api-keys
    - https://console.cloud.google.com/vertex-ai/studio/settings/api-keys
2. Copy .env.example to .env.local and add your API keys:
    - `GEMINI_API_KEY` (Required for AI generation)
    - `GCS_BUCKET_NAME` (Optional: used for Image Storage. If omitted, uses local data URIs)
    - `GOOGLE_APPLICATION_CREDENTIALS` (Optional: path to service account key. If omitted, uses a local JSON file to mock Firestore and GCS)
3. Start the dev server: npm run dev
4. Navigate to http://localhost:3000
5. Pick a character (e.g., Friendly Capybara), take a webcam picture!
6. Allow the microphone on the Storybook page. Start talking back to the Capybara to change the flow of the story.

## Deploy
1. Copy `terraform/terraform.tfvars.example` to `terraform/dev.tfvars` and update the values:
    - `TF_VAR_project_id="your-google-cloud-project-id"
    - `TF_VAR_region="us-central1"
2. Setup infrastructure:
```bash
cd terraform
terraform init
terraform apply -var-file=dev.tfvars

# Replace [REGION] and [PROJECT_ID] with your own values.
# Example below the command.
# 0. Set your project
gcloud config set project [PROJECT_ID]
# gcloud config set project gen-lang-client-0572697337

# 1. Auth Docker
gcloud auth configure-docker [REGION]-docker.pkg.dev
# gcloud auth configure-docker us-central1-docker.pkg.dev

# 2. Build (alternatively, update variables in package.json to run `npm run deploy` to replace docker build and docker push commands)
cd ..
docker build --platform linux/amd64 -t [REGION]-docker.pkg.dev/[PROJECT_ID]/storybook-repo/app:latest .
# docker build --platform linux/amd64 -t us-central1-docker.pkg.dev/gen-lang-client-0572697337/storybook-repo/app:latest .

# 3. Push to Google Cloud Run
docker push [REGION]-docker.pkg.dev/[PROJECT_ID]/storybook-repo/app:latest
# docker push us-central1-docker.pkg.dev/gen-lang-client-0572697337/storybook-repo/app:latest

# 4. Update Google Cloud Run config
terraform apply -var-file=dev.tfvars

```

## Tear down when done testing in GCP dev environment 
1. Run `terraform destroy -var-file=dev.tfvars` to delete the Cloud Run service and stop incurring idle costs.

## ⚠️ Important Cost Precautions
When running generative AI models and cloud infrastructure, it is incredibly important to protect yourself against accidental charges.

1. **Set up a Billing Alert:** Go to the [Google Cloud Billing Console](https://console.cloud.google.com/billing) and create a Budget Alert (e.g., alert me at $1.00, $5.00, and $10.00). This won't hard-stop your app, but it will email you immediately if costs spike.
2. **Hard-cap Cloud Run:** To prevent a billing spike from a sudden surge in traffic (or an infinite loop), the `terraform/main.tf` file has been configured with `max_instance_count = 2`. This guarantees Cloud Run will never scale past 2 instances.
3. **API Cost Awareness:** The Gemini Live API and Vertex AI Imagen 3 API are charged per-request and by input/output tokens. During development, constantly check your Vertex AI billing page.
4. **Tear down when done:** The best protection is cleaning up. When you are done testing on the cloud, run **`terraform destroy -var-file=dev.tfvars`** to delete the Cloud Run service and stop incurring idle costs.