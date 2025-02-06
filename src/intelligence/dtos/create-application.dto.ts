import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Data transfer object for creating an application.
 * Holds the necessary information for application creation.
 */
export class CreateApplicationDto {
  /**
   * The name of the application.
   */
  @IsString()
  @IsNotEmpty()
  name?: string;
}
