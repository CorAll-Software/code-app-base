import { SearchOutlined } from "@ant-design/icons";
import { Badge, Button, Empty, Input, Space, Tag, Tree, Typography, theme } from "antd";
import { type Key, useEffect, useMemo, useState } from "react";
import {
  type PermissionTreeNode,
  buildPermissionTree,
  collectGroupKeys,
  filterPermissions,
} from "../services/modules.config";
import type { Permission } from "../services/roles.service";

const { Text } = Typography;

// ─────────────────────────────────────────────────────────────────────────────
// PermissionsTree — selector de permisos en árbol (un solo panel, auto-agrupado)
//
// Lo usan el formulario de roles y el de usuarios (permisos específicos).
// ─────────────────────────────────────────────────────────────────────────────

interface PermissionsTreeProps {
  /** Ids de permiso marcados, como texto (las claves del árbol). */
  value?: string[];
  onChange?: (keys: string[]) => void;
  permissions: Permission[];
  /**
   * Ids que ya se tienen por otra vía (los roles del usuario): salen marcados
   * y bloqueados, y no forman parte de `value`.
   */
  lockedKeys?: string[];
  /** Etiqueta de los bloqueados, p. ej. "Por rol". */
  lockedLabel?: string;
  height?: number;
}

const isLeafKey = (key: Key): boolean => /^\d+$/.test(String(key));

const bloquear = (nodes: PermissionTreeNode[], locked: Set<string>): PermissionTreeNode[] =>
  nodes.map((n) =>
    n.isGroup
      ? { ...n, children: bloquear(n.children || [], locked) }
      : { ...n, disableCheckbox: locked.has(n.key) },
  ) as PermissionTreeNode[];

export const PermissionsTree = ({
  value: selectedKeys = [],
  onChange,
  permissions,
  lockedKeys,
  lockedLabel,
  height = 400,
}: PermissionsTreeProps) => {
  const { token } = theme.useToken();
  const [search, setSearch] = useState("");

  const locked = useMemo(() => new Set(lockedKeys || []), [lockedKeys]);
  const filtered = useMemo(() => filterPermissions(permissions, search), [permissions, search]);
  const treeData = useMemo(() => bloquear(buildPermissionTree(filtered), locked), [filtered, locked]);
  const allGroupKeys = useMemo(() => collectGroupKeys(treeData), [treeData]);
  const checkedKeys = useMemo(() => [...new Set([...selectedKeys, ...locked])], [selectedKeys, locked]);

  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  useEffect(() => { setExpandedKeys(allGroupKeys); }, [allGroupKeys]);

  const titleRender = (node: PermissionTreeNode) => {
    if (node.isGroup) {
      const isRoot = node.depth === 0;
      return (
        <Text
          strong={isRoot}
          type={isRoot ? undefined : "secondary"}
          style={{
            fontSize: isRoot ? 13 : 12,
            letterSpacing: isRoot ? "0.04em" : undefined,
          }}
        >
          {node.title}
        </Text>
      );
    }
    return (
      <Space vertical size={0}>
        <Space size={6}>
          <Text style={{ fontSize: 13 }}>{node.title}</Text>
          {lockedLabel && locked.has(node.key) && (
            <Tag style={{ fontSize: 10, lineHeight: "16px", marginInlineEnd: 0 }}>{lockedLabel}</Tag>
          )}
        </Space>
        <Text style={{ fontSize: 10, fontFamily: "monospace", color: token.colorTextQuaternary }}>
          {node.slug}
        </Text>
      </Space>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Input
          size="small"
          placeholder="Buscar permiso..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        <Badge count={selectedKeys.length} overflowCount={999} color={token.colorPrimary} />
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        paddingBottom: 4,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {selectedKeys.length} / {permissions.length} permisos
        </Text>
        <Space size={2}>
          <Button type="link" size="small" style={{ fontSize: 11, padding: "0 4px" }} onClick={() => setExpandedKeys(allGroupKeys)}>
            Expandir todo
          </Button>
          <Text type="secondary" style={{ fontSize: 11 }}>·</Text>
          <Button type="link" size="small" style={{ fontSize: 11, padding: "0 4px" }} onClick={() => setExpandedKeys([])}>
            Colapsar todo
          </Button>
        </Space>
      </div>

      <div style={{
        height,
        overflowY: "auto",
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        padding: "4px 8px",
      }}>
        {treeData.length === 0 ? (
          <Empty description="Sin permisos" style={{ padding: "40px 0" }} />
        ) : (
          <Tree
            checkable
            selectable={false}
            blockNode
            checkedKeys={checkedKeys}
            onCheck={(checked) => {
              // Lo bloqueado no lo decide este selector: se deja como estaba.
              const marcados = (checked as Key[]).filter(isLeafKey).map(String).filter((k) => !locked.has(k));
              const conservados = selectedKeys.filter((k) => locked.has(k));
              // Con búsqueda activa el árbol solo conoce lo visible: lo oculto se conserva.
              const visibles = new Set(filtered.map((p) => String(p.id)));
              const ocultos = selectedKeys.filter((k) => !visibles.has(k) && !locked.has(k));
              onChange?.([...new Set([...marcados, ...conservados, ...ocultos])]);
            }}
            expandedKeys={expandedKeys}
            onExpand={(ks) => setExpandedKeys(ks)}
            treeData={treeData as any}
            fieldNames={{ title: "title", key: "key", children: "children" }}
            titleRender={titleRender as any}
          />
        )}
      </div>
    </div>
  );
};
