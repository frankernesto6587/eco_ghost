import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Spin } from 'antd';
import { CheckOutlined, RightOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/auth.store';
import { accountsService } from '@/services/accounts.service';
import { categoriesService } from '@/services/categories.service';
import css from './Onboarding.module.css';

// ---------------------------------------------------------------------------
// Steps definition
// ---------------------------------------------------------------------------

interface StepDef {
  id: string;
  title: string;
  desc: string | ((ctx: StepContext) => string);
  time?: string;
  chip?: string;
  route: string;
  ctaLabel: string;
}

interface StepContext {
  orgName: string;
  baseCurrency: string;
  accountCount: number;
  categoryCount: number;
  memberCount: number;
}

const STEPS: StepDef[] = [
  {
    id: 'org',
    title: 'Crear tu organización',
    desc: (ctx) =>
      `Le pusimos "${ctx.orgName}". Podés cambiar el nombre y subir un logo después.`,
    route: '/organization',
    ctaLabel: 'Cambiar',
  },
  {
    id: 'currency',
    title: 'Elegir moneda principal',
    desc: (ctx) =>
      `Configurada: ${ctx.baseCurrency}. Todos los balances consolidados se mostrarán en esta moneda.`,
    route: '/organization',
    ctaLabel: 'Cambiar',
  },
  {
    id: 'account',
    title: 'Agregar tu primera cuenta',
    desc: 'Cargá al menos una cuenta para empezar a registrar movimientos. Podés agregar varias después (banco, tarjeta, efectivo, ahorros).',
    time: '~ 30 segundos',
    chip: 'saltar',
    route: '/accounts',
    ctaLabel: 'Agregar cuenta',
  },
  {
    id: 'categories',
    title: 'Definir tus categorías',
    desc: 'Usá nuestras predefinidas (clientes, software, comida, transporte…) o creá las tuyas. Siempre podés cambiarlas después.',
    time: '~ 1 minuto',
    route: '/categories',
    ctaLabel: 'Revisar',
  },
  {
    id: 'team',
    title: 'Invitar a tu equipo',
    desc: 'Si compartís finanzas con alguien (socio, pareja, contador), invitalos ahora. Pueden tener rol de editor o sólo lectura.',
    time: '~ 30 segundos',
    chip: 'opcional',
    route: '/organization',
    ctaLabel: 'Invitar',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const navigate = useNavigate();
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const user = useAuthStore((s) => s.user);

  // Data queries to determine step completion
  const { data: accounts = [], isLoading: accLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: accountsService.getAll,
  });

  const { data: categories = [], isLoading: catLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesService.getAll,
  });

  const ctx: StepContext = useMemo(
    () => ({
      orgName: currentOrg?.name ?? 'Mi organización',
      baseCurrency: currentOrg?.baseCurrency ?? 'USD',
      accountCount: accounts.length,
      categoryCount: categories.length,
      memberCount: 1, // we don't query members here
    }),
    [currentOrg, accounts, categories],
  );

  // Determine which steps are done
  const completedSteps = useMemo(() => {
    const done = new Set<string>();
    // Org is always created if we're on this page
    if (currentOrg) done.add('org');
    // Currency is set as part of org creation
    if (currentOrg?.baseCurrency) done.add('currency');
    // At least one account
    if (accounts.length > 0) done.add('account');
    // Has categories (seeded automatically)
    if (categories.length > 0) done.add('categories');
    return done;
  }, [currentOrg, accounts, categories]);

  const doneCount = completedSteps.size;
  const totalSteps = STEPS.length;

  // Find first incomplete step
  const activeStepId = useMemo(
    () => STEPS.find((s) => !completedSteps.has(s.id))?.id ?? null,
    [completedSteps],
  );

  const handleGoToDashboard = useCallback(() => {
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  const handleStepClick = useCallback(
    (route: string) => {
      navigate(route);
    },
    [navigate],
  );

  if (accLoading || catLoading) {
    return (
      <div className={css.loading}>
        <Spin size="large" />
      </div>
    );
  }

  const userName = user?.name?.split(' ')[0] ?? 'amigo';

  return (
    <div className={css.wrap}>
      {/* Hero */}
      <div className={css.hero}>
        <div className={css.logo}>eco</div>
        <h1 className={css.heroTitle}>
          Bienvenido, <span className={css.heroTitleAccent}>{userName}</span>.
          <br />
          Configuremos tu eco en 2 minutos.
        </h1>
        <p className={css.heroSub}>
          Son {totalSteps} pasos cortos. Todos son opcionales — podés saltar los
          que no necesites y volver después. Tu progreso se guarda
          automáticamente.
        </p>
      </div>

      {/* Progress */}
      <div className={css.progress}>
        <div className={css.progressBar}>
          <div
            className={css.progressFill}
            style={{ width: `${(doneCount / totalSteps) * 100}%` }}
          />
        </div>
        <div className={css.progressText}>
          <span className={css.progressCount}>{doneCount}</span> de{' '}
          {totalSteps} completados
        </div>
      </div>

      {/* Steps */}
      <div className={css.steps}>
        {STEPS.map((step) => {
          const isDone = completedSteps.has(step.id);
          const isActive = step.id === activeStepId;

          const stepClass = isDone
            ? css.stepDone
            : isActive
              ? css.stepActive
              : css.step;

          const numClass = isDone
            ? css.stepNumDone
            : isActive
              ? css.stepNumActive
              : css.stepNum;

          const desc =
            typeof step.desc === 'function' ? step.desc(ctx) : step.desc;

          return (
            <article
              key={step.id}
              className={stepClass}
              onClick={() => handleStepClick(step.route)}
            >
              <div className={numClass}>
                {isDone ? (
                  <CheckOutlined style={{ fontSize: 14 }} />
                ) : (
                  STEPS.indexOf(step) + 1
                )}
              </div>
              <div>
                <div
                  className={`${css.stepTitle} ${isDone ? css.stepTitleDone : ''}`}
                >
                  {step.title}
                  {step.chip && !isDone && (
                    <span className={css.skipChip}>{step.chip}</span>
                  )}
                </div>
                <div className={css.stepDesc}>{desc}</div>
                {step.time && !isDone && (
                  <div className={css.stepTime}>{step.time}</div>
                )}
              </div>
              <div className={css.stepCta}>
                {isDone ? (
                  <>
                    <div className={css.doneIcon}>
                      <CheckOutlined style={{ fontSize: 10 }} />
                    </div>
                    <Button size="small" onClick={(e) => { e.stopPropagation(); handleStepClick(step.route); }}>
                      Cambiar
                    </Button>
                  </>
                ) : (
                  <Button
                    type={isActive ? 'primary' : 'default'}
                    size="small"
                    onClick={(e) => { e.stopPropagation(); handleStepClick(step.route); }}
                  >
                    {step.ctaLabel}
                    {isActive && <RightOutlined style={{ fontSize: 12 }} />}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Skip */}
      <div className={css.skip}>
        No tengo tiempo ahora.{' '}
        <button className={css.skipLink} onClick={handleGoToDashboard}>
          Ir al dashboard y volver después →
        </button>
      </div>
    </div>
  );
}
