import { useState, useCallback } from 'react';
import {
  Typography,
  Button,
  Card,
  Space,
  Modal,
  Form,
  Input,
  Select,
  ColorPicker,
  Popconfirm,
  Spin,
  Empty,
  List,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { App } from 'antd';
import { categoriesService } from '@/services/categories.service';
import type { Category, CreateCategoryDto } from '@/services/categories.service';
import { usePermissions } from '@/hooks/usePermissions';
import CategoryIcon, { ICON_MAP } from '@/components/common/CategoryIcon';

const { Title, Text } = Typography;

const iconKeys = Object.keys(ICON_MAP);

function IconPicker({ value, onChange }: { value?: string; onChange?: (val: string | undefined) => void }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, 40px)',
        gap: 6,
        maxHeight: 200,
        overflowY: 'auto',
        padding: 4,
        border: '1px solid #d9d9d9',
        borderRadius: 8,
      }}
    >
      {iconKeys.map((key) => (
        <div
          key={key}
          onClick={() => onChange?.(value === key ? undefined : key)}
          title={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            fontSize: 20,
            borderRadius: 8,
            cursor: 'pointer',
            border: value === key ? '2px solid #1677ff' : '2px solid transparent',
            backgroundColor: value === key ? '#e6f4ff' : undefined,
            transition: 'all 0.15s',
          }}
        >
          {ICON_MAP[key]}
        </div>
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form] = Form.useForm<CreateCategoryDto & { color: string }>();

  // ---------- Queries ----------

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoriesService.getAll,
  });

  // Flat list of root categories for the parent select
  const rootCategories = categories.filter((c) => !c.parentId);

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
        color: category.color ?? '#1677ff',
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

      // Resolve color value -- ColorPicker can return an object or a string
      const color =
        typeof values.color === 'string'
          ? values.color
          : typeof values.color === 'object' && values.color !== null
            ? (values.color as { toHexString?: () => string }).toHexString?.() ?? '#1677ff'
            : '#1677ff';

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

  // ---------- Render helpers ----------

  const renderCategoryItem = (category: Category) => (
    <List.Item
      key={category.id}
      actions={
        canWrite
          ? [
              <Button
                key="edit"
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditModal(category)}
              />,
              <Popconfirm
                key="delete"
                title={t('common.confirm')}
                description={
                  category.children?.length > 0
                    ? t('categories.deleteConfirmWithChildren')
                    : t('categories.deleteConfirm')
                }
                onConfirm={() => handleDelete(category.id)}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                />
              </Popconfirm>,
            ]
          : undefined
      }
    >
      <Space>
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: category.color ?? '#d9d9d9',
          }}
        />
        {category.icon && (
          <CategoryIcon name={category.icon} style={{ color: category.color ?? '#8c8c8c' }} />
        )}
        <Text>{category.name}</Text>
      </Space>
    </List.Item>
  );

  // ---------- Main render ----------

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={2} style={{ margin: 0 }}>
          {t('categories.title')}
        </Title>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {t('categories.newCategory')}
          </Button>
        )}
      </div>

      {rootCategories.length === 0 ? (
        <Empty description={t('categories.noCategories')} />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {rootCategories.map((parent) => (
            <Card
              key={parent.id}
              title={
                <Space>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      backgroundColor: parent.color ?? '#d9d9d9',
                    }}
                  />
                  {parent.icon && (
                    <CategoryIcon name={parent.icon} style={{ fontSize: 16, color: parent.color ?? '#8c8c8c' }} />
                  )}
                  <span>{parent.name}</span>
                </Space>
              }
              extra={
                canWrite ? (
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEditModal(parent)}
                    />
                    <Popconfirm
                      title={t('common.confirm')}
                      description={
                        parent.children?.length > 0
                          ? t('categories.deleteConfirmWithChildren')
                          : t('categories.deleteConfirm')
                      }
                      onConfirm={() => handleDelete(parent.id)}
                      okText={t('common.confirm')}
                      cancelText={t('common.cancel')}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ) : undefined
              }
              size="small"
            >
              {parent.children?.length > 0 ? (
                <List
                  size="small"
                  dataSource={parent.children}
                  renderItem={renderCategoryItem}
                />
              ) : (
                <Text type="secondary">{t('categories.noCategories')}</Text>
              )}
            </Card>
          ))}
        </Space>
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
                      <CategoryIcon name={c.icon} style={{ color: c.color ?? '#8c8c8c' }} />
                      <span>{c.name}</span>
                    </Space>
                  ),
                  value: c.id,
                }))}
            />
          </Form.Item>

          <Form.Item name="color" label={t('categories.color')} initialValue="#1677ff">
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
