import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, Form, InputNumber, TreeSelect, DatePicker, Input, Button, Switch, Space } from 'antd';
import dayjs from 'dayjs';
import type { Budget } from '@ecoghost/shared';
import { flattenCategories } from '@/lib/categoryTree';
import type { Category } from '@/services/categories.service';

export interface BudgetFormValues {
  categoryId: string | null;
  amount: number;
  startMonth: string;
  endMonth: string | null;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: BudgetFormValues) => void;
  submitting: boolean;
  categories: Category[];
  currency: string;
  /** null = alta; con valor = edicion (categoria y moneda quedan bloqueadas) */
  editing: Budget | null;
  defaultMonth: string;
  isMobile?: boolean;
}

export function BudgetDrawer({
  open,
  onClose,
  onSubmit,
  submitting,
  categories,
  currency,
  editing,
  defaultMonth,
  isMobile,
}: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        categoryId: editing.categoryId,
        // El backend guarda centavos; el usuario piensa en unidades.
        amount: editing.amount / 100,
        startMonth: dayjs(`${editing.startMonth}-01`),
        endMonth: editing.endMonth ? dayjs(`${editing.endMonth}-01`) : null,
        notes: editing.notes ?? undefined,
        repeats: editing.endMonth === null,
      });
    } else {
      form.setFieldsValue({
        categoryId: null,
        amount: undefined,
        startMonth: dayjs(`${defaultMonth}-01`),
        endMonth: null,
        notes: undefined,
        repeats: true,
      });
    }
  }, [open, editing, defaultMonth, form]);

  const handleFinish = (values: any) => {
    onSubmit({
      categoryId: values.categoryId ?? null,
      amount: Math.round(Number(values.amount) * 100),
      startMonth: dayjs(values.startMonth).format('YYYY-MM'),
      // "Se repite" = ventana abierta. Sin cron ni filas por mes: la regla
      // simplemente no tiene fin.
      endMonth: values.repeats ? null : values.endMonth ? dayjs(values.endMonth).format('YYYY-MM') : null,
      notes: values.notes || undefined,
    });
  };

  return (
    <Drawer
      title={editing ? t('budgets.edit') : t('budgets.new')}
      open={open}
      onClose={onClose}
      placement={isMobile ? 'bottom' : 'right'}
      height={isMobile ? '85%' : undefined}
      width={isMobile ? undefined : 420}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="categoryId"
          label={t('budgets.category')}
          extra={t('budgets.categoryHint')}
        >
          <TreeSelect
            allowClear
            showSearch
            disabled={!!editing}
            treeNodeFilterProp="name"
            placeholder={t('budgets.allExpenses')}
            treeData={flattenCategories(categories)}
            styles={{ popup: { root: { maxHeight: 320, overflow: 'auto' } } }}
          />
        </Form.Item>

        <Form.Item
          name="amount"
          label={`${t('budgets.limit')} (${currency})`}
          rules={[{ required: true, message: t('budgets.limitRequired') }]}
        >
          <InputNumber style={{ width: '100%' }} min={1} step={100} />
        </Form.Item>

        <Form.Item
          name="startMonth"
          label={t('budgets.startMonth')}
          rules={[{ required: true, message: t('budgets.startMonthRequired') }]}
        >
          <DatePicker picker="month" style={{ width: '100%' }} disabled={!!editing} />
        </Form.Item>

        <Form.Item
          name="repeats"
          label={t('budgets.repeatMonthly')}
          valuePropName="checked"
          extra={t('budgets.repeatHint')}
        >
          <Switch />
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.repeats !== cur.repeats}>
          {({ getFieldValue }) =>
            getFieldValue('repeats') ? null : (
              <Form.Item name="endMonth" label={t('budgets.endMonth')}>
                <DatePicker picker="month" style={{ width: '100%' }} />
              </Form.Item>
            )
          }
        </Form.Item>

        <Form.Item name="notes" label={t('budgets.notes')}>
          <Input.TextArea rows={2} maxLength={200} />
        </Form.Item>

        <Space>
          <Button type="primary" htmlType="submit" loading={submitting}>
            {t('common.save')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </Space>
      </Form>
    </Drawer>
  );
}
