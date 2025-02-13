import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UnauthorizedException,
  Req,
  Res,
  Query,
  ForbiddenException,
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

/**
 * Controller for handling authentication-related requests.
 *
 * This controller provides endpoints for user registration, login, password management,
 * multi-factor authentication (MFA), and session transfer. It interacts with the
 * AuthService to perform the necessary authentication logic.
 */
@ApiTags('Authentication')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers a new user.
   *
   * @param registerRequest - The registration data for the new user.
   * @param context - The HTTP context containing user information.
   * @returns The result of the registration process.
   */
  @Post('register')
  async register(
    @Body() registerRequest: RegisterDto,
    @HttpContext()
    context: IHttpContext,
  ) {
    return this.authService.register(registerRequest, context);
  }

  /**
   * Logs in a user.
   *
   * @param loginRequest - The login credentials for the user.
   * @param context - The HTTP context containing user information.
   * @returns The result of the login process.
   */
  @Post('login')
  async login(
    @Body() loginRequest: LoginDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.authService.login(loginRequest, context);
  }

  /**
   * Retrieves information about the currently authenticated user.
   *
   * @param req - The HTTP context containing user information.
   * @returns The user's information.
   */
  @Get('info')
  async me(@HttpContext() req: IHttpContext) {
    return this.authService.info(req);
  }

  /**
   * Refreshes the user's authentication session.
   *
   * @param req - The HTTP context containing user information.
   * @param refreshToken - Optional refresh token to use instead of the one in cookies
   * @returns The result of the refresh process.
   */
  @Post('refresh')
  async refresh(
    @HttpContext() req: IHttpContext,
    @Body('refreshToken') refreshToken?: string,
  ) {
    return this.authService.refresh(req, refreshToken);
  }

  /**
   * Logs out the currently authenticated user.
   *
   * @param req - The HTTP context containing user information.
   * @returns The result of the logout process.
   */
  @Post('logout')
  async logout(@HttpContext() req: IHttpContext) {
    return this.authService.logout(req);
  }

  /**
   * Initiates the setup of multi-factor authentication (MFA) for the user.
   *
   * @param req - The HTTP context containing user information.
   * @returns The result of the MFA setup process.
   */
  @Auth()
  @Post('mfa/setup')
  async setupMfa(@HttpContext() req: IHttpContext) {
    return this.authService.generateQrCode(req);
  }

  /**
   * Verifies the MFA setup code provided by the user.
   *
   * @param req - The HTTP context containing user information.
   * @param code - The MFA setup code to verify.
   * @returns The result of the MFA verification process.
   */
  @Auth()
  @Post('mfa/setup/verify')
  async setupMfaSecond(
    @HttpContext() req: IHttpContext,
    @Body('code') code: string,
  ) {
    return this.authService.verifyMfaCode(req, { code });
  }

  /**
   * Verifies the MFA code during login.
   *
   * @param mfaRequest - The MFA request containing the code.
   * @param req - The HTTP context containing user information.
   * @returns The result of the MFA verification process.
   */
  @Auth()
  @Post('mfa/verify')
  async verifyMfa(
    @Body() mfaRequest: MfaDto,
    @HttpContext() req: IHttpContext,
  ) {
    return this.authService.verifyMfa(mfaRequest, req);
  }

  /**
   * Disables multi-factor authentication (MFA) for the user.
   *
   * @param req - The HTTP context containing user information.
   * @returns The result of the MFA disable process.
   */
  @Auth()
  @Patch('mfa/disable')
  async disableMfa(@HttpContext() req: IHttpContext) {
    return this.authService.disableMfa(req);
  }

  /**
   * Initiates the password reset process for the user.
   *
   * @param forgotDto - The data required to reset the password.
   * @returns The result of the password reset process.
   */
  @Post('reset-password')
  async resetPassword(@Body() forgotDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotDto);
  }

  /**
   * Verifies the password reset token.
   *
   * @param context - The HTTP context containing user information.
   * @returns The result of the password reset verification process.
   */
  @Get('reset-password/verify/:token')
  async verifyResetPassword(@HttpContext() context: IHttpContext) {
    return this.authService.resetPassword(context);
  }

  /**
   * Changes the user's password.
   *
   * @param req - The HTTP context containing user information.
   * @param changeDto - The data required to change the password.
   * @returns The result of the password change process.
   */
  @Patch('change-password')
  @Auth()
  async changePassword(
    @HttpContext() req: IHttpContext,
    @Body() changeDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req, changeDto);
  }

  /**
   * Transfers the user's authentication session to a specified return URL.
   *
   * This method checks the origin of the request, validates the user, and sets
   * the refresh token in a cookie. It then generates an HTML page to handle
   * the transfer process.
   *
   * @param req - The HTTP request object.
   * @param res - The HTTP response object.
   * @param returnURL - The URL to redirect to after the transfer.
   * @returns An HTML page for the transfer process or an error page if an error occurs.
   * @throws UnauthorizedException if the origin is invalid or credentials are invalid.
   */
  @Get('arp-transfer')
  async transferAuth(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
    @Query() returnURL: { returnUrl?: string },
  ) {
    // Load array of allowed domains from .env, comma separated
    const allowedDomains =
      process.env.ALLOWED_DOMAINS?.split(',').map((domain) =>
        domain.trim().toLowerCase(),
      ) || [];

    // Get host header and extract the domain part (without port)
    const hostHeader = req.headers.host;
    if (!hostHeader) {
      throw new ForbiddenException('Invalid domain');
    }
    const domain =
      hostHeader.indexOf(':') !== -1
        ? hostHeader.split(':')[0].toLowerCase()
        : hostHeader.toLowerCase();

    // Verify that the domain is one of the allowed domains
    if (!allowedDomains.includes(domain)) {
      throw new ForbiddenException('Domain (' + domain + ') is not allowed');
    }

    const { origin } = req.headers;

    if (origin && !allowedDomains.some((allowed) => origin.includes(allowed))) {
      throw new UnauthorizedException('Invalid origin');
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    try {
      const validUser = await this.authService.getUserSessionStatus(req);

      const refreshToken = req.cookies?.['refreshToken'];
      const nonce = randomBytes(16).toString('base64');

      if (!refreshToken || !validUser) {
        throw new UnauthorizedException('Invalid credentials');
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
                <link rel="icon" type="image/png" href="https://auth.erzen.tk/src/content/favicon-48x48.png" sizes="48x48" />

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
                        document.cookie = 'refreshToken=${refreshToken}; domain=.erzen.tk; path=/; expires=${new Date(validUser.expires).toUTCString()}; secure; samesite=none';
                        progressBar.style.width = '60%';
                        
                        await new Promise(r => setTimeout(r, 300));
                        progressBar.style.width = '90%';
                                               
                        // Final delay to ensure cookie is set
                        await new Promise(r => setTimeout(r, 300));
                        progressBar.style.width = '100%';
                        
                        status.textContent = 'ARP - Redirecting you securely...';
                        await new Promise(r => setTimeout(r, 500));
                        window.location.href = "${returnURL.returnUrl}";
                        
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
      return res.status(200).send(transferPage);
    } catch (error) {
      console.error('ARP transfer error:', error);
      const nonce = randomBytes(16).toString('base64');

      res.setHeader(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'nonce-${nonce}'; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:;`,
      );

      const authUrl = new URL('https://auth.erzen.tk');

      // Get the original returnUrl from the current request
      const currentReturnUrl = (req.query.returnUrl as string) || '';

      // Build the auth URL

      // Set returnTo to the current API endpoint with its original returnUrl
      const currentUrl = new URL(
        `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      );

      // If we already have a returnUrl, keep it for after authentication
      if (currentReturnUrl) {
        authUrl.searchParams.set(
          'return_to',
          `${currentUrl.origin}${currentUrl.pathname}?returnUrl=${encodeURIComponent(currentReturnUrl)}`,
        );
      } else {
        authUrl.searchParams.set(
          'return_to',
          `${currentUrl.origin}${currentUrl.pathname}`,
        );
      }

      const errorPage = `
       <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Required - TrustPort</title>
    <style nonce="${nonce}">
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #f8f9ff 0%, #f2f4ff 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: white;
            padding: 2.5rem;
            border-radius: 20px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 440px;
            text-align: center;
            transform: translateY(0);
            opacity: 1;
            animation: slideUp 0.6s cubic-bezier(0.23, 1, 0.32, 1);
        }

        .logo {
            margin-bottom: 1.75rem;
            position: relative;
        }

        .logo svg {
            width: 64px;
            height: 64px;
            filter: drop-shadow(0 4px 6px rgba(239, 68, 68, 0.15));
            transform: scale(1);
            animation: iconPulse 1.5s ease-in-out infinite;
        }

        h1 {
            font-size: 1.75rem;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 0.75rem;
            letter-spacing: -0.5px;
        }

        #error-message {
            font-size: 1.05rem;
            color: #4b5563;
            line-height: 1.5;
            margin-bottom: 2rem;
            padding: 0 1rem;
        }

        .redirect-notice {
            background: #f8f9fc;
            border-radius: 12px;
            padding: 1.25rem;
            margin-top: 2rem;
        }

        .redirect-text {
            color: #64748b;
            font-size: 0.95rem;
            margin-bottom: 0.5rem;
        }

        .countdown {
            color: #4f46e5;
            font-weight: 600;
        }

        .progress-container {
            height: 6px;
            background: #e5e7eb;
            border-radius: 3px;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            background: #4f46e5;
            transition: width 0.3s ease;
            width: 0%;
        }

        .manual-action {
            margin-top: 2rem;
        }

        .retry-button {
            background: #4f46e5;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .retry-button:hover {
            background: #4338ca;
            transform: translateY(-1px);
        }

        @keyframes slideUp {
            from {
                transform: translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        @keyframes iconPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
        </div>
        <h1>Authentication Required</h1>
        <p id="error-message">You need to be authenticated to access this page. Please wait while we redirect you to the login page.</p>
        
        <div class="redirect-notice">
            <p class="redirect-text">Redirecting in <span class="countdown">5</span> seconds</p>
            <div class="progress-container">
                <div class="progress-bar"></div>
            </div>
        </div>

        <div class="manual-action">
            <button class="retry-button" onclick="window.location.reload()">
                Retry Now
            </button>
        </div>
    </div>

    <script nonce="${nonce}">
        // Animated countdown and progress bar
        let seconds = 5;
        const countdownElement = document.querySelector('.countdown');
        const progressBar = document.querySelector('.progress-bar');

        const updateProgress = () => {
            const progress = ((5 - seconds) / 5) * 100;
            progressBar.style.width = progress;
            countdownElement.textContent = seconds;
            seconds--;

            if (seconds < 0) {
              window.location.href = "${authUrl.toString()}?returnTo=${returnURL.returnUrl}";
            }
        };

        // Initial update
        updateProgress();
        // Update every second
        const countdownInterval = setInterval(updateProgress, 1000);
    </script>
</body>
</html>
      `;

      res.status(401).send(errorPage);
    }
  }
}
