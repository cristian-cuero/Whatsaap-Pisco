
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Languages } from 'lucide-react';
import { GithubIcon } from '../components/GithubIcon';
import { CustomSelect } from '../components/CustomSelect';
import {
  languageOptions,
  resolveSupportedLanguage,
  type SupportedLanguage,
} from '../i18n';
import { humanAuthApi, type HumanLoginResponse } from '../services/api';
import './Login.css';

interface LoginProps {
  onLogin: (response: HumanLoginResponse) => void;
}

export function Login({ onLogin }: LoginProps) {
  const { t, i18n } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const currentLang = resolveSupportedLanguage(
    i18n.resolvedLanguage || i18n.language
  );

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setError('Ingresa tu correo electrónico y contraseña.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Enviamos las credenciales al endpoint de autenticación humana.
      const response = await humanAuthApi.login(cleanEmail, password);

      // App.tsx recibe el JWT y administra la sesión.
      onLogin(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible iniciar sesión. Inténtalo nuevamente.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <img
            src="/openwa_logo.webp"
            alt="OpenWA"
            className="logo-icon"
          />
          <span className="version-info">
            {t('login.version', {
              version: __APP_VERSION__,
              date: new Date(__BUILD_TIME__)
                .toISOString()
                .slice(0, 10)
                .replace(/-/g, ''),
            })}
          </span>
        </div>

        <div className="login-language">
          <Languages size={18} />
          <CustomSelect
            value={currentLang}
            onChange={value => changeLanguage(value as SupportedLanguage)}
            options={languageOptions.map(opt => ({
              value: opt.value,
              label: opt.label,
            }))}
            ariaLabel={t('common.language')}
          />
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="email">Correo electrónico</label>
            <div className="input-wrapper">
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Ingresa tu correo electrónico"
                autoComplete="username"
                className={error ? 'error' : ''}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Contraseña</label>
            <div className="input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                autoComplete="current-password"
                className={error ? 'error' : ''}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                required
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <span
              id="login-error"
              className="error-message"
              role="alert"
            >
              {error}
            </span>
          )}

          <button
            type="submit"
            className="connect-btn"
            disabled={isLoading}
          >
            {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="login-help">
          {t('login.help')}{' '}
          <a
            href="https://docs.open-wa.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('login.viewDocs')}
          </a>
        </p>
      </div>

      <footer className="login-footer">
        <span>{t('login.footer')}</span>
        <a
          href="https://github.com/rmyndharis/OpenWA"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
          aria-label="GitHub"
        >
          <GithubIcon size={18} />
        </a>
      </footer>
    </div>
  );
}
