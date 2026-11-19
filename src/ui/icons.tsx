import React from 'react';
import * as L from 'lucide-react';

/** Single thin-line icon set (lucide-react). Default stroke 1.75 to match the mockups' thin icons. */
type P = React.SVGProps<SVGSVGElement> & { size?: number | string };
const w = (C: React.ComponentType<any>) => (p: P) => <C strokeWidth={1.75} width={p.width ?? 20} height={p.height ?? p.width ?? 20} {...p} />;

export const I = {
  today: w(L.LayoutDashboard), log: w(L.Plus), foods: w(L.Apple), recipes: w(L.CookingPot), plan: w(L.CalendarDays),
  progress: w(L.ChartNoAxesCombined), assistant: w(L.Sparkles), settings: w(L.SlidersHorizontal), more: w(L.Ellipsis),
  search: w(L.Search), left: w(L.ChevronLeft), right: w(L.ChevronRight), down: w(L.ChevronDown), trash: w(L.Trash2), star: w(L.Star),
  drop: w(L.Droplet), scale: w(L.Scale), barcode: w(L.ScanBarcode), camera: w(L.Camera), pot: w(L.CookingPot), close: w(L.X),
  copy: w(L.Copy), edit: w(L.Pencil), leaf: w(L.Leaf), check: w(L.Check), checkCircle: w(L.CircleCheck), alert: w(L.CircleAlert),
  logo: w(L.Activity), sparkles: w(L.Sparkles), bell: w(L.Bell), zap: w(L.Zap), flame: w(L.Flame), utensils: w(L.Utensils), watch: w(L.Watch),
  dumbbell: w(L.Dumbbell), steps: w(L.Footprints), hourglass: w(L.Hourglass), swap: w(L.ArrowRightLeft), dots: w(L.EllipsisVertical),
  image: w(L.ImagePlus), plus: w(L.Plus), minus: w(L.Minus), user: w(L.User), trendDown: w(L.TrendingDown), trendUp: w(L.TrendingUp),
  flag: w(L.Flag), info: w(L.Info), gauge: w(L.Gauge), brain: w(L.BrainCircuit), flask: w(L.FlaskConical), bookmark: w(L.Bookmark),
  clock: w(L.Clock), history: w(L.History), calendar: w(L.CalendarRange), sun: w(L.Sun), moon: w(L.Moon), ruler: w(L.Ruler),
  weight: w(L.Weight), salad: w(L.Salad), waves: w(L.Waves), list: w(L.ListChecks), chart: w(L.ChartSpline),
};
export type IconName = keyof typeof I;
