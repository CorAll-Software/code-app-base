import { spawn } from 'child_process';

// Script para generar una contraseña encriptada
// Uso: bun run src/utils/new-password.ts tu_contraseña

const args = process.argv.slice(2);

if (args.length === 0) {
    console.warn('❌ Error: Debes proporcionar una contraseña como argumento');
    console.log('\nUso:');
    console.log('  bun run src/utils/new-password.ts <tu_contraseña>');
    console.log('\nEjemplo:');
    console.log('  bun run src/utils/new-password.ts MiPassword123!');
    process.exit(1);
}

const password = args[0];

const copyToClipboard = (text: string) => {
    const platform = process.platform;
    let command: string;
    let args: string[] = [];

    if (platform === 'win32') {
        command = 'clip';
    } else if (platform === 'darwin') {
        command = 'pbcopy';
    } else {
        command = 'xclip';
        args = ['-selection', 'clipboard'];
    }

    const proc = spawn(command, args);
    proc.stdin.write(text);
    proc.stdin.end();

    return new Promise<void>((resolve, reject) => {
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Proceso terminó con código ${code}`));
            }
        });
        proc.on('error', reject);
    });
};

try {
    const encryptedPassword = Bun.password.hashSync(password);

    console.log('\n✅ Contraseña encriptada exitosamente\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Hash encriptado:\n');
    console.log(encryptedPassword);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Copiar al portapapeles
    copyToClipboard(encryptedPassword)
        .then(() => {
            console.log('✨ Hash copiado al portapapeles!\n');
        })
        .catch((error) => {
            console.warn('⚠️  No se pudo copiar al portapapeles:', error.message);
        });

} catch (error) {
    console.warn('❌ Error al encriptar la contraseña:', error);
    process.exit(1);
}
