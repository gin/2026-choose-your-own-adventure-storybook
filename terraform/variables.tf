variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

variable "gemini_api_key" {
  description = "The Gemini API Key"
  type        = string
  sensitive   = true
}
