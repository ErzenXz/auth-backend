import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UnauthorizedException,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto } from './dtos';
import { Auth } from './decorators/auth.decorator';
import { HttpContext } from './decorators/headers.decorator';
import type { HttpContext as IHttpContext } from './models/http.model';
import { MfaDto } from './dtos/mfa.dto';
import { ApiTags } from '@nestjs/swagger';
import { ChangePasswordDto } from './dtos/change.password.dto';
import { Response, Request } from 'express';
import { randomBytes } from 'crypto';

@ApiTags('Authentication')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(
    @Body() registerRequest: RegisterDto,
    @HttpContext()
    context: IHttpContext,
  ) {
    return this.authService.register(registerRequest, context);
  }

  @Post('login')
  async login(
    @Body() loginRequest: LoginDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.authService.login(loginRequest, context);
  }

  @Get('info')
  async me(@HttpContext() req: IHttpContext) {
    return this.authService.info(req);
  }

  @Post('refresh')
  async refresh(@HttpContext() req: IHttpContext) {
    return this.authService.refresh(req);
  }

  @Post('logout')
  async logout(@HttpContext() req: IHttpContext) {
    return this.authService.logout(req);
  }

  @Post('mfa/setup')
  async setupMfa(@HttpContext() req: IHttpContext) {
    return this.authService.generateQrCode(req);
  }

  @Post('mfa/setup/verify')
  async setupMfaSecond(@HttpContext() req: IHttpContext, @Body() code: string) {
    return this.authService.verifyMfaCode(req, code);
  }

  @Post('mfa/verify')
  async verifyMfa(
    @Body() mfaRequest: MfaDto,
    @HttpContext() req: IHttpContext,
  ) {
    return this.authService.verifyMfa(mfaRequest, req);
  }

  @Auth()
  @Patch('mfa/disable')
  async disableMfa(@HttpContext() req: IHttpContext) {
    return this.authService.disableMfa(req);
  }

  @Post('reset-password')
  async resetPassword(@Body() forgotDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotDto);
  }

  @Get('reset-password/verify/:token')
  async verifyResetPassword(@HttpContext() context: IHttpContext) {
    return this.authService.resetPassword(context);
  }

  @Patch('change-password')
  @Auth()
  async changePassword(
    @HttpContext() req: IHttpContext,
    @Body() changeDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req, changeDto);
  }

  @Get('arp-transfer')
  async transferAuth(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ) {
    try {
      const refreshToken = req.cookies?.['refreshToken'];
      const nonce = randomBytes(16).toString('base64');

      const user = await this.authService.findUserSe(req);

      if (!refreshToken || !user) {
        // Get the original returnUrl from the current request
        const currentReturnUrl = (req.query.returnUrl as string) || '';

        // Build the auth URL
        const authUrl = new URL('https://auth.erzen.xyz');

        // Set returnTo to the current API endpoint with its original returnUrl
        const currentUrl = new URL(
          `${req.protocol}://${req.get('host')}${req.originalUrl}`,
        );

        // If we already have a returnUrl, keep it for after authentication
        if (currentReturnUrl) {
          authUrl.searchParams.set(
            'return_to',
            `${currentUrl.origin}${currentUrl.pathname}?return_to=${encodeURIComponent(currentReturnUrl)}`,
          );
        } else {
          authUrl.searchParams.set(
            'return_to',
            `${currentUrl.origin}${currentUrl.pathname}`,
          );
        }

        // Redirect to auth.erzen.xyz
        return res.redirect(authUrl.toString());
      }

      // Set CSP headers
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'nonce-${nonce}'; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:;`,
      );

      const transferPage = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TrustPort - ARP</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link rel="icon" type="image/png" href="https://auth.erzen.xyz/src/content/favicon-48x48.png" sizes="48x48" />

            <style nonce="${nonce}">
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Inter', sans-serif;
                    background: linear-gradient(135deg, #f6f7fe 0%, #f0f3ff 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }

                .container {
                    background: white;
                    padding: 2.5rem;
                    border-radius: 16px;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
                    width: 100%;
                    max-width: 400px;
                    text-align: center;
                }

                .logo {
                    margin-bottom: 1.5rem;
                }

                .logo svg {
                    width: 48px;
                    height: 48px;
                }

                h1 {
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin-bottom: 0.5rem;
                }

                #status {
                    font-size: 1rem;
                    color: #4b5563;
                    margin-bottom: 1.5rem;
                }

                .progress {
                    width: 100%;
                    height: 4px;
                    background: #e5e7eb;
                    border-radius: 2px;
                    overflow: hidden;
                    position: relative;
                }

                .progress-bar {
                    position: absolute;
                    height: 100%;
                    background: #4f46e5;
                    border-radius: 2px;
                    transition: width 0.3s ease;
                    width: 0%;
                }

                .error {
                    background: #fee2e2;
                    color: #991b1b;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-top: 1rem;
                    display: none;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .pulse {
                    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                </div>
                <h1>TrustPort ARP</h1>
                <p id="status">Transferring your secure session...</p>
                <div class="progress">
                    <div class="progress-bar"></div>
                </div>
                <div id="error" class="error"></div>
            </div>

            <script nonce="${nonce}">
                (async function() {
                    const progressBar = document.querySelector('.progress-bar');
                    const status = document.getElementById('status');
                    const error = document.getElementById('error');
                    
                    try {
                        // Animate progress bar
                        progressBar.style.width = '30%';
                        await new Promise(r => setTimeout(r, 300));
                        
                        // Set cookie
                        document.cookie = 'refreshToken=${refreshToken}; domain=.erzen.tk; path=/; secure; samesite=none';
                        progressBar.style.width = '60%';
                        
                        await new Promise(r => setTimeout(r, 300));
                        progressBar.style.width = '90%';
                        
                        // Get return URL
                        const params = new URLSearchParams(window.location.search);
                        const returnUrl = params.get('returnUrl');
                        
                        // Final delay to ensure cookie is set
                        await new Promise(r => setTimeout(r, 300));
                        progressBar.style.width = '100%';
                        
                        if (returnUrl) {
                            status.textContent = 'ARP - Redirecting you securely...';
                            await new Promise(r => setTimeout(r, 500));
                            window.location.reload();
                        } else {
                            status.textContent = 'ARP - Authentication transfer complete';
                            progressBar.style.background = '#22c55e';
                            window.location.reload();
                        }
                    } catch (err) {
                        console.error('Auth transfer failed:', err);
                        progressBar.style.background = '#ef4444';
                        status.textContent = 'ARP -  transfer failed';
                        error.style.display = 'block';
                        error.textContent = err.message || 'An unexpected error occurred';
                    }
                })();
            </script>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html');
      return res.send(transferPage);
    } catch (error) {
      console.error('ARP transfer error:', error);
      const nonce = randomBytes(16).toString('base64');

      res.setHeader(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'nonce-${nonce}'; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:;`,
      );

      const errorPage = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TrustPort - ARP</title>
            <style nonce="${nonce}">
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Inter', sans-serif;
                    background: linear-gradient(135deg, #f6f7fe 0%, #f0f3ff 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }

                .container {
                    background: white;
                    padding: 2.5rem;
                    border-radius: 16px;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
                    width: 100%;
                    max-width: 400px;
                    text-align: center;
                }

                .logo {
                    margin-bottom: 1.5rem;
                }

                .logo svg {
                    width: 48px;
                    height: 48px;
                }

                h1 {
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin-bottom: 0.5rem;
                }

                #status {
                    font-size: 1rem;
                    color: #4b5563;
                    margin-bottom: 1.5rem;
                }

                .progress {
                    width: 100%;
                    height: 4px;
                    background: #e5e7eb;
                    border-radius: 2px;
                    overflow: hidden;
                    position: relative;
                }

                .progress-bar {
                    position: absolute;
                    height: 100%;
                    background: #4f46e5;
                    border-radius: 2px;
                    transition: width 0.3s ease;
                    width: 0%;
                }

                .error {
                    background: #fee2e2;
                    color: #991b1b;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-top: 1rem;
                    display: none;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .pulse {
                    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                </div>
                <h1>Authentication Error</h1>
                <p id="error-message">${error.message}</p>
            </div>
        </body>
        </html>
      `;

      res.status(401).send(errorPage);
    }
  }
}
