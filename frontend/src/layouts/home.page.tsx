import { CSSProperties, useEffect, useState } from 'react'
import { BRAND } from '@src/core/color'

export const Home = () => {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const styles: { [key: string]: CSSProperties } = {
        container: {
            width: '100%',
            minHeight: 'calc(100vh - 90px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            backgroundImage: `
                radial-gradient(circle at 15% 20%, rgba(177, 24, 32, 0.06) 0%, transparent 45%),
                radial-gradient(circle at 85% 80%, rgba(83, 68, 55, 0.05) 0%, transparent 45%)
            `,
            padding: isMobile ? '2rem 1rem' : '3rem 2rem',
            position: 'relative',
            overflow: 'hidden'
        },
        card: {
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            borderRadius: '1.5rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 20px 50px rgba(14, 11, 9, 0.08), 0 4px 12px rgba(14, 11, 9, 0.04)',
            border: '1px solid rgba(14, 11, 9, 0.05)',
            maxWidth: '640px',
            width: '100%',
            textAlign: 'center',
            overflow: 'hidden',
            zIndex: 1
        },
        logoBanner: {
            background: BRAND.primary,
            padding: isMobile ? '2rem 1rem' : '2.5rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        },
        logo: {
            height: isMobile ? '64px' : '84px',
            width: 'auto',
            objectFit: 'contain'
        },
        body: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: isMobile ? '2rem 1.75rem 2.25rem' : '2.5rem 3rem 2.75rem'
        },
        title: {
            fontSize: isMobile ? '1.5rem' : '1.875rem',
            fontWeight: 700,
            color: BRAND.text,
            margin: 0,
            letterSpacing: '-0.5px'
        },
        description: {
            fontSize: isMobile ? '0.95rem' : '1.0625rem',
            color: BRAND.secondary,
            fontWeight: 600,
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '1px'
        },
        subtitle: {
            fontSize: isMobile ? '0.9rem' : '0.975rem',
            color: BRAND.textSecondary,
            margin: 0,
            lineHeight: 1.65,
            maxWidth: '460px'
        }
    }

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.logoBanner}>
                    <img src="/webp/logo.png" alt="CorAll" style={styles.logo} />
                </div>
                <div style={styles.body}>
                    <h1 style={styles.title}>Bienvenido</h1>
                    <p style={styles.description}>
                        Plataforma Digital Corporativa
                    </p>
                    <p style={styles.subtitle}>
                        Plantilla base CorAll: autenticación, usuarios, roles, permisos y auditoría listos para construir los módulos de tu proyecto.
                    </p>
                </div>
            </div>
        </div>
    )
}
