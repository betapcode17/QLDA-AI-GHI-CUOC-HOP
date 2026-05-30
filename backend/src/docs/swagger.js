import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env.js';

export const openApiSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'AI Meeting Assistant API',
      version: '1.0.0',
      description: 'RESTful backend for meetings, transcripts, summaries, files, AI processing, auth, dashboard, and audit logs.'
    },
    servers: [{ url: env.API_BASE_URL }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['login', 'password'],
          properties: { login: { type: 'string' }, password: { type: 'string' } }
        },
        RegisterRequest: {
          type: 'object',
          required: ['username', 'password', 'fullName', 'email'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
            fullName: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['Admin', 'Manager', 'Member'] }
          }
        },
        Meeting: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            startTime: { type: 'string', format: 'date-time' },
            endTime: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['Scheduled', 'InProgress', 'Completed', 'Archived'] }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': { get: { security: [], summary: 'Proxy AI service health', responses: { 200: { description: 'OK' } } } },
      '/meetings': {
        get: { security: [], summary: 'List meetings with cursor pagination', parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }, { name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Meeting page' } } },
        post: { summary: 'Create meeting', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Meeting' } } } }, responses: { 201: { description: 'Created' } } }
      },
      '/meetings/{id}': {
        get: { security: [], summary: 'Get meeting detail', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Meeting detail' } } },
        put: { summary: 'Update meeting', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { summary: 'Soft delete meeting', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } }
      },
      '/api/process': { post: { security: [], summary: 'Proxy full AI audio processing to FastAPI', requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { 200: { description: 'AI result' } } } },
      '/meetings/{id}/process-audio': {
        post: {
          summary: 'Upload audio, call AI processing service, and persist file, speakers, transcripts, summary, and action items',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } } } },
          responses: { 201: { description: 'Persisted AI processing result' } }
        }
      },
      '/meetings/{id}/transcripts/import': {
        post: {
          summary: 'Import transcript segments from TXT, JSON, SRT, or VTT',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'replace', in: 'query', schema: { type: 'boolean' } }
          ],
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } } } },
          responses: { 201: { description: 'Imported transcript segments' } }
        }
      },
      '/search': {
        get: {
          summary: 'Global search across meetings, transcripts, summaries, and action items',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
          ],
          responses: { 200: { description: 'Grouped search results' } }
        }
      },
      '/meetings/{id}/export/{format}': {
        get: {
          summary: 'Export meeting minutes as JSON, DOCX, or PDF',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'format', in: 'path', required: true, schema: { type: 'string', enum: ['json', 'docx', 'pdf'] } }
          ],
          responses: {
            200: {
              description: 'Meeting export file',
              content: {
                'application/json': {},
                'application/pdf': {},
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {}
              }
            }
          }
        }
      },
      '/dashboard/overview': { get: { summary: 'Dashboard overview counters', responses: { 200: { description: 'Overview' } } } },
      '/dashboard/analytics': { get: { summary: 'Dashboard analytics', responses: { 200: { description: 'Analytics' } } } }
    }
  },
  apis: []
});

export const setupSwagger = (app) => {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
};
