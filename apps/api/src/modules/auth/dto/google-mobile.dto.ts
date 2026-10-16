import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleMobileDto {
  @ApiProperty({ description: 'ID token de Google obtenido con Credential Manager en el móvil' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
