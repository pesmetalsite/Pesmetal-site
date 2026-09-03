/**
 * Validadores Zod centralizados.
 * Toda entrada de dados da API passa por aqui.
 */
import { z } from 'zod';
import { ApiError } from './errors.js';

// === Auth ===
export const LoginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha muito curta'),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
  role: z.enum(['admin', 'gestor', 'atendente']),
});

// === Lead ===
export const CreateLeadSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  phone: z.string().min(8, 'Telefone inválido'),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().optional(),
  service_id: z.string().optional(),
  description: z.string().optional(),
  quantity: z.string().optional(),
  deadline: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  assigned_user_id: z.string().optional(),
  stage_id: z.string().optional(),
});

export const UpdateLeadSchema = z.object({
  name: z.string().min(2).optional(),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(8).optional(),
  interest: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  estimated_value: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  description: z.string().optional(),
  quantity: z.string().optional(),
  deadline: z.string().optional(),
  assigned_user_id: z.string().optional(),
  service_id: z.string().optional(),
});

export const MoveLeadSchema = z.object({
  lead_id: z.string().min(1),
  stage_id: z.string().min(1),
});

export const LeadNoteSchema = z.object({
  content: z.string().min(1),
});

// === Pipeline ===
export const CreateStageSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  position: z.number().int().optional(),
});

export const UpdateStageSchema = CreateStageSchema.partial().extend({
  active: z.boolean().optional(),
  is_initial: z.boolean().optional(),
  is_won: z.boolean().optional(),
  is_lost: z.boolean().optional(),
});

// === Services / Projects ===
export const CreateServiceSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'slug deve ser kebab-case'),
  description: z.string().optional(),
  image: z.string().optional(),
  category: z.string().optional(),
  position: z.number().int().optional(),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  category: z.string().optional(),
  client: z.string().optional(),
  images: z.array(z.string()).optional(),
  featured: z.boolean().optional(),
  date: z.string().optional(),
});

// === Appointments ===
export const CreateAppointmentSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['visit', 'meeting', 'call', 'quote', 'return', 'other']),
  date: z.string().min(1, 'Data obrigatória'),
  duration_min: z.number().int().positive().optional(),
  notes: z.string().optional(),
  lead_id: z.string().optional(),
  user_id: z.string().optional(),
});

// === Quotes ===
export const CreateQuoteSchema = z.object({
  lead_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().nonnegative().default(0),
  valid_until: z.string().optional(),
  status: z.enum(['draft', 'sent', 'analyzing', 'approved', 'rejected', 'expired']).optional(),
  items: z.array(z.object({
    description: z.string(),
    qty: z.number().positive(),
    unit_price: z.number().nonnegative(),
  })).optional(),
  notes: z.string().optional(),
});

// === Automations ===
export const AutomationNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum([
      'message', 'menu', 'set_interest', 'move_stage', 'set_tag',
      'assign_user', 'request_file', 'request_info', 'wait_input',
      'transfer_human', 'end', 'go_back', 'branch_keyword',
    ]),
    config: z.record(z.any()).optional().default({}),
    next: z.string().nullable().optional(),
    options: z.array(z.object({
      key: z.string(),
      label: z.string().optional(),
      next: z.string(),
    })).optional(),
  })
);

export const AutomationGraphSchema = z.object({
  entry: z.string(),
  nodes: z.array(AutomationNodeSchema),
});

export const CreateAutomationSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  trigger: z.enum(['new_contact', 'message_received', 'keyword', 'lead_created']),
  keyword: z.string().optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).optional(),
  graph: AutomationGraphSchema,
});

// === Public (site) ===
export const PublicLeadSchema = z.object({
  name: z.string().min(2, 'Nome é obrigatório'),
  phone: z.string().min(8, 'Telefone é obrigatório'),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().optional(),
  service_id: z.string().optional(),
  service_slug: z.string().optional(),
  description: z.string().optional(),
  quantity: z.string().optional(),
  deadline: z.string().optional(),
  notes: z.string().optional(),
  session_token: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
  referrer: z.string().optional(),
  landing_page: z.string().optional(),
});

export const PublicTrackSchema = z.object({
  session_token: z.string().optional(),
  event: z.string(),
  source: z.string().optional(),
  payload: z.any().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
  referrer: z.string().optional(),
  landing_page: z.string().optional(),
});

// === Helpers ===
export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(422, 'validation_error', 'Dados inválidos', result.error.flatten());
  }
  return result.data;
}
