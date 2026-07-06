import { Table, TableProps, Grid, Button, Typography } from "antd";
import { useRef } from "react";

const { Text } = Typography;

export interface DataTableProps<T> extends TableProps<T> {
  scrollHeight?: string | number;
  disableSticky?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  mobileTotal?: number;
}

export function DataTable<T extends object>({
  scrollHeight,
  disableSticky = false,
  pagination,
  scroll,
  style,
  onLoadMore,
  loadingMore,
  mobileTotal,
  summary,
  dataSource,
  ...props
}: DataTableProps<T>) {
  const divRef = useRef<HTMLDivElement>(null);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const defaultPagination =
    pagination !== false
      ? {
          size: "small",
          showSizeChanger: true,
          placement: "bottomRight" as const,
          sticky: !disableSticky,
          showTotal: (total: number) => `Total: ${total} registros`,
          ...((typeof pagination === "object" ? pagination : {}) as any),
        }
      : false;

  const defaultScroll = isMobile
    ? scroll || undefined
    : {
        x: "max-content",
        ...scroll,
      };

  const currentCount = dataSource?.length ?? 0;

  return (
    <div
      ref={divRef}
      className="data-table-container"
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        ...(isMobile ? {} : { flex: 1, minHeight: 0 }),
        ...style,
      }}
    >
      <Table<T>
        className="fixed-pagination-table"
        sticky={
          !disableSticky && !isMobile
            ? {
                offsetHeader: 0,
                offsetScroll: 0,
                getContainer: () => divRef.current || window,
              }
            : false
        }
        pagination={defaultPagination}
        scroll={{ ...defaultScroll, y: undefined }}
        tableLayout="fixed"
        summary={summary}
        dataSource={dataSource}
        style={{
          display: "flex",
          flexDirection: "column",
        }}
        {...props}
      />
      {isMobile && typeof mobileTotal === "number" && currentCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: "12px 16px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text type="secondary" style={{ fontSize: 13 }}>
            Mostrando {currentCount} de {mobileTotal}
          </Text>
          {(onLoadMore || loadingMore) && (
            <Button
              block
              onClick={onLoadMore}
              loading={loadingMore}
              disabled={!onLoadMore}
              style={{ maxWidth: 320, borderRadius: 8 }}
              aria-label={`Cargar más resultados. Mostrando ${currentCount} de ${mobileTotal}`}
            >
              Cargar más
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
