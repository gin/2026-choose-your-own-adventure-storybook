output "cloud_run_url" {
  description = "The URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.storybook_app.uri
}

output "bucket_name" {
  description = "The name of the Cloud Storage bucket for assets"
  value       = google_storage_bucket.multimodal_assets.name
}
