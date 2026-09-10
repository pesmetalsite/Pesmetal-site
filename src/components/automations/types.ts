export interface AutomationSummary {
  id: string
  name: string
  description: string | null
  status: string
  trigger?: string
  updated_at?: string
}

export interface AutomationDetail extends AutomationSummary {
  initial_message: string | null
  invalid_message: string | null
  options: string | null
  graph: string | null
  instance_ids?: string | null
  closing_message?: string | null
}

export interface WhatsAppInstance {
  id: string
  name: string
  instance_name: string
  status: string
}

export interface AutomationOption {
  id: string
  label: string
  message: string
  stage_id: string
  transfer_human: boolean
}

export interface Stage {
  id: string
  name: string
  color?: string
}
