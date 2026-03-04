import {
  DollarOutlined,
  WalletOutlined,
  ShopOutlined,
  LaptopOutlined,
  PlusCircleOutlined,
  HomeOutlined,
  ThunderboltOutlined,
  BuildOutlined,
  CoffeeOutlined,
  ShoppingCartOutlined,
  CarOutlined,
  FireOutlined,
  SwapOutlined,
  TeamOutlined,
  ReadOutlined,
  HeartOutlined,
  SmileOutlined,
  WifiOutlined,
  DesktopOutlined,
  EllipsisOutlined,
  TagOutlined,
  BankOutlined,
  CreditCardOutlined,
  GiftOutlined,
  MedicineBoxOutlined,
  PhoneOutlined,
  ToolOutlined,
  TrophyOutlined,
  CarryOutOutlined,
  BookOutlined,
  BulbOutlined,
  CameraOutlined,
  ClockCircleOutlined,
  CloudOutlined,
  CompassOutlined,
  CrownOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  EyeOutlined,
  FlagOutlined,
  FundOutlined,
  GlobalOutlined,
  GoldOutlined,
  HddOutlined,
  InsuranceOutlined,
  KeyOutlined,
  LikeOutlined,
  LockOutlined,
  MailOutlined,
  ManOutlined,
  MobileOutlined,
  MoneyCollectOutlined,
  NotificationOutlined,
  PaperClipOutlined,
  PictureOutlined,
  PrinterOutlined,
  PropertySafetyOutlined,
  RestOutlined,
  RocketOutlined,
  SafetyOutlined,
  SaveOutlined,
  AppleOutlined,
  ScissorOutlined,
  SendOutlined,
  SettingOutlined,
  ShoppingOutlined,
  SkinOutlined,
  SoundOutlined,
  StarOutlined,
  TabletOutlined,
  TagsOutlined,
  TruckOutlined,
  UsbOutlined,
  VideoCameraOutlined,
  WomanOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  CalendarOutlined,
  ContainerOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  ForkOutlined,
  InboxOutlined,
  PieChartOutlined,
  ScheduleOutlined,
  SolutionOutlined,
  StockOutlined,
  TransactionOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export const ICON_MAP: Record<string, ReactNode> = {
  // Dinero y finanzas
  dollar: <DollarOutlined />,
  wallet: <WalletOutlined />,
  bank: <BankOutlined />,
  'credit-card': <CreditCardOutlined />,
  'money-collect': <MoneyCollectOutlined />,
  gold: <GoldOutlined />,
  fund: <FundOutlined />,
  stock: <StockOutlined />,
  transaction: <TransactionOutlined />,
  insurance: <InsuranceOutlined />,
  'property-safety': <PropertySafetyOutlined />,

  // Compras y comercio
  shop: <ShopOutlined />,
  shopping: <ShoppingOutlined />,
  'shopping-cart': <ShoppingCartOutlined />,
  gift: <GiftOutlined />,
  tags: <TagsOutlined />,
  'bar-chart': <BarChartOutlined />,
  'pie-chart': <PieChartOutlined />,

  // Hogar y construccion
  home: <HomeOutlined />,
  build: <BuildOutlined />,
  tool: <ToolOutlined />,
  key: <KeyOutlined />,
  lock: <LockOutlined />,
  apartment: <ApartmentOutlined />,
  container: <ContainerOutlined />,

  // Transporte
  car: <CarOutlined />,
  truck: <TruckOutlined />,
  rocket: <RocketOutlined />,
  compass: <CompassOutlined />,
  environment: <EnvironmentOutlined />,
  global: <GlobalOutlined />,
  send: <SendOutlined />,

  // Alimentacion y bebidas
  coffee: <CoffeeOutlined />,
  rest: <RestOutlined />,
  apple: <AppleOutlined />,
  fork: <ForkOutlined />,

  // Tecnologia
  laptop: <LaptopOutlined />,
  desktop: <DesktopOutlined />,
  mobile: <MobileOutlined />,
  tablet: <TabletOutlined />,
  wifi: <WifiOutlined />,
  cloud: <CloudOutlined />,
  database: <DatabaseOutlined />,
  hdd: <HddOutlined />,
  usb: <UsbOutlined />,
  printer: <PrinterOutlined />,
  camera: <CameraOutlined />,
  'video-camera': <VideoCameraOutlined />,
  setting: <SettingOutlined />,

  // Personas y familia
  team: <TeamOutlined />,
  man: <ManOutlined />,
  woman: <WomanOutlined />,
  'customer-service': <CustomerServiceOutlined />,
  solution: <SolutionOutlined />,

  // Salud y bienestar
  heart: <HeartOutlined />,
  'medicine-box': <MedicineBoxOutlined />,
  experiment: <ExperimentOutlined />,
  safety: <SafetyOutlined />,
  smile: <SmileOutlined />,

  // Educacion y cultura
  read: <ReadOutlined />,
  book: <BookOutlined />,
  bulb: <BulbOutlined />,
  trophy: <TrophyOutlined />,
  crown: <CrownOutlined />,
  flag: <FlagOutlined />,

  // Entretenimiento
  picture: <PictureOutlined />,
  sound: <SoundOutlined />,
  skin: <SkinOutlined />,
  star: <StarOutlined />,
  like: <LikeOutlined />,

  // Comunicacion
  phone: <PhoneOutlined />,
  mail: <MailOutlined />,
  notification: <NotificationOutlined />,

  // Energia y servicios
  thunderbolt: <ThunderboltOutlined />,
  fire: <FireOutlined />,

  // Organizacion
  calendar: <CalendarOutlined />,
  schedule: <ScheduleOutlined />,
  'carry-out': <CarryOutOutlined />,
  'file-text': <FileTextOutlined />,
  'paper-clip': <PaperClipOutlined />,
  inbox: <InboxOutlined />,
  appstore: <AppstoreOutlined />,
  'unordered-list': <UnorderedListOutlined />,
  dashboard: <DashboardOutlined />,
  save: <SaveOutlined />,

  // Otros
  swap: <SwapOutlined />,
  scissor: <ScissorOutlined />,
  eye: <EyeOutlined />,
  'clock-circle': <ClockCircleOutlined />,
  'plus-circle': <PlusCircleOutlined />,
  ellipsis: <EllipsisOutlined />,
};

interface CategoryIconProps {
  name: string | null | undefined;
  style?: React.CSSProperties;
}

export default function CategoryIcon({ name, style }: CategoryIconProps) {
  if (!name) return null;
  const icon = ICON_MAP[name];
  if (!icon) return <TagOutlined style={style} />;
  return <span style={style}>{icon}</span>;
}
