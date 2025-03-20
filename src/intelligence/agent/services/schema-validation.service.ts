import { Injectable, Logger } from '@nestjs/common';
import { IValidationResult } from '../models';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

@Injectable()
export class SchemaValidationService {
  private readonly ajv: Ajv;
  private readonly logger = new Logger(SchemaValidationService.name);

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    });

    // Add formats like date, email, uri, etc.
    addFormats(this.ajv);
  }

  /**
   * Validate data against a JSON schema
   */
  validateData(data: any, schema: object): IValidationResult {
    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(data);

      return {
        valid,
        errors: validate.errors || [],
      };
    } catch (error) {
      this.logger.error(
        `Schema validation error: ${(error as Error).message}`,
        error,
      );

      return {
        valid: false,
        errors: [
          {
            keyword: 'schemaError',
            message: `Schema validation failed: ${(error as Error).message}`,
            params: { error: (error as Error).message },
          },
        ],
      };
    }
  }

  /**
   * Format validation errors to be more human-readable
   */
  formatErrors(errors: any[]): string[] {
    if (!errors || errors.length === 0) {
      return [];
    }

    return errors.map((error) => {
      const { keyword, message, params, instancePath } = error;

      // Format based on error keyword
      switch (keyword) {
        case 'required':
          return `Missing required property: ${params.missingProperty} at ${instancePath || '/'}`;

        case 'type':
          return `Invalid type at ${instancePath || '/'}: expected ${params.type}, got ${typeof params.data}`;

        case 'enum':
          return `Invalid value at ${instancePath || '/'}: must be one of [${params.allowedValues.join(', ')}]`;

        case 'format':
          return `Invalid format at ${instancePath || '/'}: must be a valid ${params.format}`;

        default:
          return message || `Validation error: ${JSON.stringify(error)}`;
      }
    });
  }
}
