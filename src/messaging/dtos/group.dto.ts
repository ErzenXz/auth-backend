import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({
    description: 'The name of the group',
    example: 'Project Team',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'The description of the group',
    example: 'Group for project discussions',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Array of user IDs to add to the group',
    example: ['user-id-1', 'user-id-2'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  members: string[];
}

export class GroupMessageDto {
  @ApiProperty({
    description: 'The content of the message',
    example: 'Hello everyone!',
  })
  @IsNotEmpty()
  @IsString()
  content: string;
}

export class AddGroupMemberDto {
  @ApiProperty({
    description: 'Array of user IDs to add to the group',
    example: ['user-id-1', 'user-id-2'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}
