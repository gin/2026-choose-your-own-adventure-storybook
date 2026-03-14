terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "run_api" {
  project = var.project_id
  service = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "aiplatform_api" {
  project = var.project_id
  service = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firestore_api" {
  project = var.project_id
  service = "firestore.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry_api" {
  project = var.project_id
  service = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

# Cloud Storage Bucket for generated images/audio
resource "google_storage_bucket" "multimodal_assets" {
  name          = "${var.project_id}-story-assets"
  location      = var.region
  force_destroy = true
  uniform_bucket_level_access = true
  
  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

# Make the bucket publicly readable
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.multimodal_assets.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Firestore Database (Native mode)
resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  
  depends_on = [google_project_service.firestore_api]
}

# Artifact Registry Repository
resource "google_artifact_registry_repository" "storybook_repo" {
  location      = var.region
  repository_id = "storybook-repo"
  description   = "Docker repository for the Storybook app"
  format        = "DOCKER"
  
  depends_on = [google_project_service.artifactregistry_api]
}

# Service Account for Cloud Run
resource "google_service_account" "app_sa" {
  account_id   = "storybook-app-sa"
  display_name = "Storybook App Service Account"
}

# Grant Vertex AI User role
resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

# Grant Storage Admin role
resource "google_project_iam_member" "storage_admin" {
  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

# Grant Datastore User role (for Firestore)
resource "google_project_iam_member" "datastore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

# Cloud Run Service (placeholder for now)
resource "google_cloud_run_v2_service" "storybook_app" {
  name     = "storybook-app"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  
  template {
    service_account = google_service_account.app_sa.email
    scaling {
      max_instance_count = 2
    }
    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello" # Placeholder image
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.multimodal_assets.name
      }
    }
  }

  depends_on = [
    google_project_service.run_api
  ]
}

# Make Cloud Run service publicly accessible
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.storybook_app.location
  project  = google_cloud_run_v2_service.storybook_app.project
  name     = google_cloud_run_v2_service.storybook_app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
