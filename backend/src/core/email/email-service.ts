
// nodemailer 10 / @types/nodemailer 8: los tipos pasaron de namespace a
// exportaciones nombradas, así que `nodemailer.Transporter` ya no existe.
import nodemailer, { type SentMessageInfo, type Transporter } from 'nodemailer';
import path from 'node:path';
import { configServer } from '@/config';

interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
}

interface EmailAttachment {
    filename: string;
    path: string;
    cid?: string;
}

interface EmailData {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: EmailAttachment[];
}

const EMAIL_LOGO_PATH = path.resolve(import.meta.dir, '../../../assets/email-logo.png');
const EMAIL_LOGO_CID = 'email-logo';

class EmailService {

    private transporter: Transporter | undefined;
    private team = configServer.team || 'App';

    constructor() {
        this.initializeTransporter();
    }

    private initializeTransporter() {
        // Configuración por defecto para Gmail, pero puede cambiarse desde config
        const emailConfig: EmailConfig = {
            host: configServer.email?.host || 'smtp.gmail.com',
            port: configServer.email?.port || 587,
            secure: configServer.email?.secure || false,
            auth: {
                user: configServer.email?.user || '',
                pass: configServer.email?.password || ''
            }
        };

        this.transporter = nodemailer.createTransport(emailConfig);
    }

    async sendRecoveryCode({ email, code, names, domain }: { email: string; code: string; names: string; domain: string }): Promise<boolean> {
        try {
            const emailData: EmailData = {
                to: email,
                subject: `Código de recuperación de contraseña - ${this.team}`,
                html: this.getRecoveryEmailTemplate(code, names, domain),
                text: `Su código de recuperación es: ${code}. Este código expira en 15 minutos.`,
                attachments: [{
                    filename: 'email-logo.png',
                    path: EMAIL_LOGO_PATH,
                    cid: EMAIL_LOGO_CID
                }]
            };

            await this.sendEmail(emailData);
            return true;
        } catch (error) {
            console.error('Error enviando correo de recuperación:', error);
            return false;
        }
    }

    async sendEmail(emailData: EmailData): Promise<SentMessageInfo> {
        const mailOptions = {
            from: `"${this.team}" <${configServer.email?.user}>`,
            to: emailData.to,
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text,
            attachments: emailData.attachments
        };

        return await this.transporter!.sendMail(mailOptions);
    }

    private getRecoveryEmailTemplate(code: string, names: string, _domain: string): string {
        const primaryColor = '#b11820';
        const logoUrl = `cid:${EMAIL_LOGO_CID}`;

        return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recuperación de Contraseña - ${this.team}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                body { 
                    margin: 0; padding: 0; 
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; color: #262626; background-color: #f0f2f5; 
                }
                .container { width: 100%; max-width: 550px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08); }
                .header { padding: 40px 20px; text-align: center; background: #ffffff; }
                .logo { height: 30px; width: auto; margin: 0 auto; display: block; }
                .content { padding: 40px 30px; text-align: center; }
                .title { font-size: 20px; font-weight: 700; color: ${primaryColor}; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.5px; }
                .code-container { background: #fafafa; border: 1px solid #eeeeee; border-radius: 12px; padding: 24px; margin: 32px 0; }
                .code { font-size: 30px; font-weight: 800; color: #262626; letter-spacing: 12px; margin: 12px 0; font-family: 'Inter', sans-serif; }
                .alert { background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; padding: 16px; margin-top: 24px; text-align: left; }
                .footer { background: #ffffff; padding: 24px; text-align: center; font-size: 11px; color: #8c8c8c; border-top: 1px solid #f0f0f0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="${logoUrl}" alt="${this.team}" class="logo">
                </div>
                
                <div class="content">
                    <h2 class="title">Recuperación de Acceso</h2>
                    
                    <p style="color: #595959; font-size: 15px; margin-bottom: 30px;">
                        Hola, <strong>${names}</strong>. Hemos recibido tu solicitud de cambio de contraseña.
                        Usa el siguiente PIN de seguridad:
                    </p>
                    
                    <div class="code-container">
                        <p style="margin: 0; color: #8c8c8c; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 2px;">PIN de un solo uso</p>
                        <div class="code">${code}</div>
                        <p style="margin: 0; color: ${primaryColor}; font-size: 13px; font-weight: 600;">Expira en 15 minutos</p>
                    </div>

                    <div class="alert">
                        <p style="margin: 0; color: #d48806; font-size: 12px; line-height: 1.4;">
                            <strong>Aviso:</strong> Si no reconoces esta actividad, accede a tu perfil y cambia tu contraseña de inmediato. Nunca compartas este código.
                        </p>
                    </div>
                </div>
                
                <div class="footer">
                    <p style="margin-top: 0;">© ${new Date().getFullYear()} ${this.team}. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.transporter!.verify();
            return true;
        } catch (error) {
            console.error('Error de conexión al servidor de correo:', error);
            return false;
        }
    }
}

export const emailService = new EmailService();
