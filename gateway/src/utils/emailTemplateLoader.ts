import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to email templates directory
const TEMPLATES_DIR = join(__dirname, '..', 'templates', 'emails');

// Cache for loaded templates
const templateCache: Map<string, string> = new Map();

/**
 * Load and populate an email template with variables
 * Variables are replaced using {{variable}} syntax
 * Supports conditional blocks with {{#variable}}...{{/variable}}
 * Supports inverted conditionals with {{^variable}}...{{/variable}}
 */
export async function loadTemplate(
  templateName: string,
  variables: Record<string, string>
): Promise<string> {
  try {
    // Load template content
    let content = await getTemplateContent(templateName);

    // Load base template if this isn't the base template itself
    if (templateName !== 'base') {
      const baseContent = await getTemplateContent('base');
      // Replace {{content}} in base with the template content
      content = baseContent.replace(/\{\{content\}\}/g, content);
    }

    // Process conditional blocks {{#variable}}...{{/variable}}
    content = processConditionals(content, variables);

    // Process inverted conditionals {{^variable}}...{{/variable}}
    content = processInvertedConditionals(content, variables);

    // Replace all {{variable}} placeholders
    content = replaceVariables(content, variables);

    // Clean up any remaining template tags
    content = cleanupUnusedTags(content);

    return content;
  } catch (error) {
    logger.error(`Failed to load email template: ${templateName}`, error);
    throw new Error(`Failed to load email template: ${templateName}`);
  }
}

/**
 * Get template content from cache or file system
 */
async function getTemplateContent(templateName: string): Promise<string> {
  // Check cache first
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName)!;
  }

  // Load from file system
  const templatePath = join(TEMPLATES_DIR, `${templateName}.html`);
  const content = await readFile(templatePath, 'utf-8');

  // Cache the template
  templateCache.set(templateName, content);

  return content;
}

/**
 * Process conditional blocks {{#variable}}...{{/variable}}
 * If variable has a truthy value, content is shown, otherwise removed
 */
function processConditionals(content: string, variables: Record<string, string>): string {
  const conditionalRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

  return content.replace(conditionalRegex, (match, variable, innerContent) => {
    if (variables[variable] && variables[variable].trim() !== '') {
      return innerContent;
    }
    return '';
  });
}

/**
 * Process inverted conditionals {{^variable}}...{{/variable}}
 * If variable is falsy or empty, content is shown
 */
function processInvertedConditionals(content: string, variables: Record<string, string>): string {
  const invertedRegex = /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

  return content.replace(invertedRegex, (match, variable, innerContent) => {
    if (!variables[variable] || variables[variable].trim() === '') {
      return innerContent;
    }
    return '';
  });
}

/**
 * Replace all {{variable}} placeholders with their values
 */
function replaceVariables(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    return variables[variable] !== undefined ? variables[variable] : match;
  });
}

/**
 * Clean up any remaining unused template tags
 */
function cleanupUnusedTags(content: string): string {
  // Remove any remaining conditional blocks
  content = content.replace(/\{\{[#^](\w+)\}\}[\s\S]*?\{\{\/\1\}\}/g, '');

  // Remove any remaining simple variables (keep them as empty)
  content = content.replace(/\{\{\w+\}\}/g, '');

  return content;
}

/**
 * Clear the template cache (useful for development)
 */
export function clearTemplateCache(): void {
  templateCache.clear();
  logger.info('Email template cache cleared');
}

/**
 * Get all available template names
 */
export async function getAvailableTemplates(): Promise<string[]> {
  const { readdir } = await import('fs/promises');
  try {
    const files = await readdir(TEMPLATES_DIR);
    return files
      .filter((file) => file.endsWith('.html'))
      .map((file) => file.replace('.html', ''));
  } catch (error) {
    logger.error('Failed to read templates directory', error);
    return [];
  }
}

export default { loadTemplate, clearTemplateCache, getAvailableTemplates };
