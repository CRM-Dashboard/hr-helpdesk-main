/**
 * Roles and permissions — read-only, and deliberately so.
 *
 * `PUT /admin/roles/:roleId/permissions` is not built: it changes what every
 * administrator in the business can do in one statement, with no department to
 * contain it, and the grant it most obviously affects is the one that would let
 * you correct the mistake. There is no UI for it here for the same reason.
 *
 * What this screen *is* for: the codes come from the database rather than from a
 * list hardcoded in the frontend, so a permissions view cannot drift from the
 * seed the first time a code is added. `/auth/me` says which codes you hold; this
 * says what they mean.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminKeys,
  useAdminPermissions,
  useRoles,
} from "../../hooks/pg";
import {
  HELPDESK_PERMISSION,
  RequirePermission,
  usePermissions,
} from "../../permissions";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { ApiErrorNotice } from "../components/ApiErrorNotice";

type Lens = "permissions" | "roles";

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [lens, setLens] = useState<Lens>("permissions");
  const [search, setSearch] = useState("");

  const { has } = usePermissions();
  const permissions = useAdminPermissions();
  const roles = useRoles(true);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = permissions.data ?? [];
    if (!term) return rows;
    return rows.filter(
      (row) =>
        row.code.toLowerCase().includes(term) ||
        row.description.toLowerCase().includes(term),
    );
  }, [permissions.data, search]);

  const isFetching = permissions.isFetching || roles.isFetching;

  return (
    <RequirePermission
      permission={HELPDESK_PERMISSION.ROLE_READ}
      title="Roles and permissions"
    >
      <AdminPageHeader
        title="Roles & permissions"
        icon={KeyRound}
        // Roles are platform-wide, so the department in scope is irrelevant here.
        showScope={false}
        description="What each role may do. Seeded and read-only: changing a grant would alter what every administrator can do, with no department to contain it."
        isFetching={isFetching}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: adminKeys.permissions() });
          queryClient.invalidateQueries({ queryKey: adminKeys.roles(true) });
        }}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={lens} onValueChange={(v) => setLens(v as Lens)}>
            <TabsList className="h-8">
              <TabsTrigger value="permissions" className="text-xs">
                Permissions
              </TabsTrigger>
              <TabsTrigger value="roles" className="text-xs">
                Roles
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {lens === "permissions" && (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a permission"
              className="h-8 w-64 text-sm"
            />
          )}
        </div>

        <ApiErrorNotice error={permissions.error ?? roles.error} />

        {lens === "permissions" && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Yours</TableHead>
                  <TableHead className="w-72">Code</TableHead>
                  <TableHead>What it allows</TableHead>
                  <TableHead>Held by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      Loading the catalogue…
                    </TableCell>
                  </TableRow>
                )}

                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {/* The authoritative answer, from /auth/me rather than
                          inferred from this row's `held_by`. */}
                      {has(row.code) && (
                        <Check className="h-4 w-4 text-emerald-600" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="flex items-center gap-1.5">
                        {row.code}
                        {row.is_dangerous && (
                          <span title="Dangerous — confirmed before it runs">
                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{row.description}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.held_by.map((code) => (
                          <Badge
                            key={code}
                            variant="outline"
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {code}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {lens === "roles" && (
          <div className="space-y-3">
            {(roles.data ?? []).map((role) => (
              <div
                key={role.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {role.name}
                  </h3>
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 font-mono text-[10px] text-slate-500"
                  >
                    {role.code}
                  </Badge>
                  {role.is_system && (
                    <Badge
                      variant="outline"
                      className="h-5 border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-500"
                    >
                      system
                    </Badge>
                  )}
                  {!role.is_active && (
                    <Badge
                      variant="outline"
                      className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700"
                    >
                      inactive
                    </Badge>
                  )}
                </div>

                {role.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {role.description}
                  </p>
                )}

                <p className="mt-2 text-xs text-muted-foreground">
                  {role.permission_count} permission
                  {role.permission_count === 1 ? "" : "s"}
                </p>

                {role.permissions && role.permissions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.permissions.map((code) => (
                      <Badge
                        key={code}
                        variant="outline"
                        className="h-5 px-1.5 font-mono text-[10px] text-slate-600"
                      >
                        {code}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="pb-4 text-xs text-muted-foreground">
          A role says <em>what</em>; a person's department says <em>where</em>.
          There is no department-scoped permission in this schema, which is why
          this screen carries no department selector.
        </p>
      </div>
    </RequirePermission>
  );
}
