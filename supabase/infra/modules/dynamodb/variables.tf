variable "table_name" {
  description = "DynamoDB table name"
  type        = string
}

variable "billing_mode" {
  description = "DynamoDB billing mode"
  type        = string
  default     = "PAY_PER_REQUEST"
}

variable "enable_pitr" {
  description = "Enable point-in-time recovery"
  type        = bool
  default     = true
}

variable "ttl_attribute" {
  description = "TTL attribute name (empty to disable)"
  type        = string
  default     = "ttl"
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
