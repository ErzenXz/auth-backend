import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Data Transfer Object (DTO) for message content validation.
 *
 * This class defines the structure of a message, ensuring that the content is a
 * non-empty string. It utilizes class-validator decorators to enforce validation rules
 * on the properties, which helps maintain data integrity when processing messages.
 */
export class MessageDto {
  /**
   * The content of the message.
   *
   * This property must be a string with a minimum length of 1 character.
   *
   * @type {string}
   * @example 'Hello, World!'
   * @validation @IsString() - Ensures the value is a string.
   * @validation @MinLength(1) - Ensures the string is at least 1 character long.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content: string;
}
