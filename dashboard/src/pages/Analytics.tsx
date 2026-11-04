import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { DashboardCharts } from '../components/DashboardCharts';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function Analytics() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.analytics'));

  return (
    <div className="dashboard">
      <PageHeader title={t('nav.analytics')} subtitle="Estadísticas de mensajes de tu empresa" badge={<BarChart3 size={18} />} />
      <DashboardCharts />
    </div>
  );
}
