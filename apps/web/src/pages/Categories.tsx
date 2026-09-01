import { useState, useCallback, useMemo } from 'react';
import {
  Button,
  Modal,
  Form,
  Input,
  Select,
  ColorPicker,
  Popconfirm,
  Space,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  RightOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { App } from 'antd';
import { budgetsService } from '@/services/budgets.service';
import { categoriesService } from '@/services/categories.service';
import type { Category, CreateCategoryDto } from '@/services/categories.service';
import { usePermissions } from '@/hooks/usePermissions';
import CategoryIcon, { ICON_MAP } from '@/components/common/CategoryIcon';
import css from './Categories.module.css';

const iconKeys = Object.keys(ICON_MAP);

function IconPicker({ value, onChange }: { value?: string; onChange?: (val: string | undefined) => void }) {
  return (
    <div className={css.iconPicker}>
      {iconKeys.map((key) => (
        <div
          key={key}
          onClick={() => onChange?.(value === key ? undefined : key)}
          title={key}
          className={value === key ? css.iconPickerItemSelected : css.iconPickerItem}
        >
          {ICON_MAP[key]}
        </div>
      ))}
    </div>
  );
}

/** Lighten a hex color to create a soft background */
function colorToBg(hex: string | null | undefined): string {
  if (!hex) return 'var(--eco-accent-weak)';
  return `color-mix(in oklab, ${hex} 18%, var(--eco-surface))`;
}

export default function CategoriesPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [form] = Form.useForm<CreateCategoryDto & { color: string }>();

  // ---------- Queries ----------

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoriesService.getAll,
  });

  const rootCategories = categories.filter((c) => !c.parentId);

  const totalCount = categories.length;

  // ---------- Mutations ----------

  const createMutation = useMutation({
    mutationFn: (payload: CreateCategoryDto) => categoriesService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      message.success(t('categories.createSuccess'));
      closeModal();
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateCategoryDto> }) =>
      categoriesService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      message.success(t('categories.updateSuccess'));
      closeModal();
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // Los presupuestos cuelgan de la categoria con onDelete: Cascade, asi que
  // borrarla se los lleva por delante. Se avisa antes en vez de sorprender.
  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', 'all'],
    queryFn: () => budgetsService.getAll({ includeInactive: true }),
  });

  const budgetCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of budgets) {
      if (!b.categoryId) continue;
      map.set(b.categoryId, (map.get(b.categoryId) ?? 0) + 1);
    }
    return map;
  }, [budgets]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      message.success(t('categories.deleteSuccess'));
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // ---------- Handlers ----------

  const openCreateModal = useCallback(() => {
    setEditingCategory(null);
    form.resetFields();
    setModalOpen(true);
  }, [form]);

  const openEditModal = useCallback(
    (category: Category) => {
      setEditingCategory(category);
      form.setFieldsValue({
        name: category.name,
        icon: category.icon ?? '',
        color: category.color ?? '#d07a1c',
        parentId: category.parentId ?? undefined,
      });
      setModalOpen(true);
    },
    [form],
  );

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingCategory(null);
    form.resetFields();
  }, [form]);

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();

      const color =
        typeof values.color === 'string'
          ? values.color
          : typeof values.color === 'object' && values.color !== null
            ? (values.color as { toHexString?: () => string }).toHexString?.() ?? '#d07a1c'
            : '#d07a1c';

      const payload: CreateCategoryDto = {
        name: values.name,
        icon: values.icon || undefined,
        color,
        parentId: values.parentId || undefined,
      };

      if (editingCategory) {
        updateMutation.mutate({ id: editingCategory.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch {
      // Validation failed -- form will show errors
    }
  }, [form, editingCategory, createMutation, updateMutation]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation],
  );

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---------- Main render ----------

  if (isLoading) {
    return (
      <div className={css.page}>
        <div className={css.loading}>
          <span className={css.loadingText}>cargando categorías...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={css.page}>
      {/* Page header */}
      <header className={css.pageHead}>
        <div>
          <h1 className={css.pageTitle}>Categorías</h1>
          <div className={css.pageSub}>
            {totalCount} categoría{totalCount !== 1 ? 's' : ''}
          </div>
        </div>
        <div className={css.pageActions}>
          {canWrite && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Nueva categoría
            </Button>
          )}
        </div>
      </header>

      {rootCategories.length === 0 ? (
        <div className={css.emptyState}>
          <div className={css.emptyIcon}><AppstoreOutlined /></div>
          <div className={css.emptyText}>{t('categories.noCategories')}</div>
          <div className={css.emptySub}>Crea tu primera categoría para organizar tus movimientos</div>
        </div>
      ) : (
        <div className={css.catList}>
          {rootCategories.map((parent) => {
            const isExpanded = expandedGroups.has(parent.id);
            const childCount = parent.children?.length ?? 0;

            return (
              <div key={parent.id} className={css.catGroup}>
                {/* Parent row */}
                <div
                  className={css.catGroupHead}
                  onClick={() => toggleGroup(parent.id)}
                >
                  <div
                    className={css.catIcon}
                    style={{
                      '--cat-color': colorToBg(parent.color),
                      '--cat-fg': parent.color ?? undefined,
                    } as React.CSSProperties}
                  >
                    {parent.icon ? (
                      <CategoryIcon name={parent.icon} />
                    ) : (
                      <span
                        className={css.catDot}
                        style={{ backgroundColor: parent.color ?? 'var(--eco-fg4)' }}
                      />
                    )}
                  </div>

                  <div className={css.catMeta}>
                    <div className={css.catName}>
                      {parent.name}
                      {childCount > 0 && (
                        <span className={css.catChildCount}>{childCount}</span>
                      )}
                    </div>
                  </div>

                  {canWrite && (
                    <div className={css.catActions} onClick={(e) => e.stopPropagation()}>
                      <button
                        className={css.catActionBtn}
                        onClick={() => openEditModal(parent)}
                        title="Editar"
                      >
                        <EditOutlined />
                      </button>
                      <Popconfirm
                        title={t('common.confirm')}
                        description={
                          <>
                            {childCount > 0
                              ? t('categories.deleteConfirmWithChildren')
                              : t('categories.deleteConfirm')}
                            {budgetCountByCategory.has(parent.id) && (
                              <div style={{ marginTop: 6, color: 'var(--eco-accent)' }}>
                                {t('categories.deleteWithBudgets')}
                              </div>
                            )}
                          </>
                        }
                        onConfirm={() => handleDelete(parent.id)}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                      >
                        <button
                          className={`${css.catActionBtn} ${css.catActionBtnDanger}`}
                          title="Eliminar"
                        >
                          <DeleteOutlined />
                        </button>
                      </Popconfirm>
                    </div>
                  )}

                  {childCount > 0 && (
                    <span className={isExpanded ? css.catExpandOpen : css.catExpand}>
                      <RightOutlined />
                    </span>
                  )}
                </div>

                {/* Children */}
                {isExpanded && (
                  <div className={css.catChildren}>
                    {childCount > 0 ? (
                      parent.children!.map((child) => (
                        <div key={child.id} className={css.catChild}>
                          <div
                            className={css.catChildIcon}
                            style={{
                              '--cat-color': colorToBg(child.color),
                              '--cat-fg': child.color ?? undefined,
                            } as React.CSSProperties}
                          >
                            {child.icon ? (
                              <CategoryIcon name={child.icon} />
                            ) : (
                              <span
                                className={css.catChildDot}
                                style={{ backgroundColor: child.color ?? 'var(--eco-fg4)' }}
                              />
                            )}
                          </div>

                          <div className={css.catChildName}>
                            {child.name}
                          </div>

                          {canWrite && (
                            <div className={css.catActions} onClick={(e) => e.stopPropagation()}>
                              <button
                                className={css.catActionBtn}
                                onClick={() => openEditModal(child)}
                                title="Editar"
                              >
                                <EditOutlined />
                              </button>
                              <Popconfirm
                                title={t('common.confirm')}
                                description={
                                  <>
                                    {t('categories.deleteConfirm')}
                                    {budgetCountByCategory.has(child.id) && (
                                      <div style={{ marginTop: 6, color: 'var(--eco-accent)' }}>
                                        {t('categories.deleteWithBudgets')}
                                      </div>
                                    )}
                                  </>
                                }
                                onConfirm={() => handleDelete(child.id)}
                                okText={t('common.confirm')}
                                cancelText={t('common.cancel')}
                              >
                                <button
                                  className={`${css.catActionBtn} ${css.catActionBtnDanger}`}
                                  title="Eliminar"
                                >
                                  <DeleteOutlined />
                                </button>
                              </Popconfirm>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className={css.catEmptyChildren}>
                        {t('categories.noCategories')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        title={editingCategory ? t('categories.editCategory') : t('categories.newCategory')}
        onCancel={closeModal}
        onOk={handleSubmit}
        okText={editingCategory ? t('common.save') : t('common.create')}
        cancelText={t('common.cancel')}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('categories.categoryName')}
            rules={[{ required: true, message: t('categories.categoryName') }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="parentId" label={t('categories.parentCategory')}>
            <Select
              allowClear
              placeholder={t('categories.noParent')}
              options={rootCategories
                .filter((c) => c.id !== editingCategory?.id)
                .map((c) => ({
                  label: (
                    <Space>
                      <CategoryIcon name={c.icon} style={{ color: c.color ?? 'var(--eco-fg3)' }} />
                      <span>{c.name}</span>
                    </Space>
                  ),
                  value: c.id,
                }))}
            />
          </Form.Item>

          <Form.Item name="color" label={t('categories.color')} initialValue="#d07a1c">
            <ColorPicker format="hex" />
          </Form.Item>

          <Form.Item name="icon" label={t('categories.icon')}>
            <IconPicker />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
