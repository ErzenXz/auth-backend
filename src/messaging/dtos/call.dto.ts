import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum CallType {
  VOICE = 'voice',
  VIDEO = 'video',
}

export class InitiateCallDto {
  @ApiProperty({
    description: 'The type of call (voice or video)',
    enum: CallType,
    example: CallType.VIDEO,
  })
  @IsEnum(CallType)
  type: CallType;

  @ApiProperty({
    description: 'Array of user IDs to invite to the call',
    example: ['user-id-1', 'user-id-2'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  participants: string[];
}

export class CallSignalDto {
  @ApiProperty({
    description: 'The ID of the recipient user',
    example: 'user-id-1',
  })
  @IsNotEmpty()
  @IsString()
  recipientId: string;

  @ApiProperty({
    description: 'The WebRTC signal data',
    example: '{"type":"offer","sdp":"..."}',
  })
  @IsNotEmpty()
  signalData: any;
}
