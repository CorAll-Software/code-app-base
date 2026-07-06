import { Select, DatePicker, TreeSelect, Typography } from 'antd';
import type { SelectProps, TreeSelectProps } from 'antd';
import type { Dayjs } from 'dayjs';

const { Text } = Typography;

interface BaseFilterProps {
  label: string;
}

export const FilterMultiSelect = ({ label, ...props }: BaseFilterProps & SelectProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>{label}</Text>
    <Select
      mode="multiple"
      allowClear
      maxTagCount="responsive"
      placeholder="Todos"
      style={{ width: '100%', minWidth: 200 }}
      size="middle"
      {...props}
    />
  </div>
);

export const FilterSelect = ({ label, ...props }: BaseFilterProps & SelectProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>{label}</Text>
    <Select
      allowClear
      placeholder="Seleccionar"
      style={{ width: '100%', minWidth: 200 }}
      size="middle"
      {...props}
    />
  </div>
);

export const FilterDateRange = ({ label, ...props }: BaseFilterProps & any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>{label}</Text>
    <DatePicker.RangePicker
      format="DD/MM/YYYY"
      placeholder={["Desde", "Hasta"]}
      style={{ width: '100%', minWidth: 240 }}
      size="middle"
      {...props}
    />
  </div>
);

export const FilterTreeMultiSelect = ({ label, ...props }: BaseFilterProps & TreeSelectProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>{label}</Text>
    <TreeSelect
      style={{ width: '100%', minWidth: 250 }}
      popupMatchSelectWidth={false}
      placeholder="Seleccionar"
      allowClear
      multiple
      treeCheckable
      showCheckedStrategy={TreeSelect.SHOW_PARENT}
      maxTagCount="responsive"
      size="middle"
      {...props}
    />
  </div>
);

interface FilterMonthPickerProps extends BaseFilterProps {
  value?: Dayjs | null;
  onChange?: (date: Dayjs | null) => void;
  placeholder?: string;
}

export const FilterMonthPicker = ({ label, value, onChange, placeholder = 'Todos los períodos', ...props }: FilterMonthPickerProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>{label}</Text>
    <DatePicker
      picker="month"
      format="MMMM YYYY"
      allowClear
      placeholder={placeholder}
      style={{ width: '100%', minWidth: 180 }}
      size="middle"
      value={value}
      onChange={onChange}
      {...props}
    />
  </div>
);

/** Devuelve true si al menos uno de los valores de filtro está activo (no nulo, no vacío). */
export const checkHasActiveFilters = (...values: unknown[]): boolean =>
    values.some(v => v != null && v !== '' && (Array.isArray(v) ? v.length > 0 : true))

export const FilterContainer = ({ children }: { children: React.ReactNode }) => (
  <div
    className="thin-scrollbar"
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      width: 320,
      padding: '4px 0',
      maxHeight: '65vh',
      overflowY: 'auto',
      overflowX: 'hidden'
    }}
  >
    {children}
  </div>
);
