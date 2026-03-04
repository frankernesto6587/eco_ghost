# Org Switcher + Sistema de Invitaciones por Token

## Resumen

Simplificar el sistema de organizaciones: cada org tiene un token fijo que el owner comparte. El invitado pega el token en el org switcher para unirse como VIEWER. El owner puede regenerar el token y opcionalmente expulsar miembros al hacerlo.

## Flujo

### Owner invita
1. Va a Organizacion > Configuracion
2. Copia el token de invitacion (campo readonly + boton copiar)
3. Lo comparte por WhatsApp, en persona, etc.

### Invitado se une
1. En el dropdown del org switcher (header), click "Unirse a organizacion"
2. Pega el token en el modal
3. Se agrega como VIEWER, se cambia automaticamente a esa org

### Owner regenera token
1. Click "Regenerar token" en Configuracion
2. Modal muestra checklist de miembros (excepto owner)
3. Marca los que quiere expulsar (opcional)
4. Confirma: nuevo token generado, miembros marcados eliminados
5. Miembros no marcados siguen adentro sin afectarse

### Cambio de org
1. Usuario clickea org en el dropdown del header
2. Se redirige al Dashboard
3. Todos los datos se recargan con la nueva org (invalidar cache de React Query)

## Backend

### Schema
- Agregar `inviteToken String @unique @default(uuid())` a modelo `Organization`
- Eliminar modelo `Invitation` y su migracion

### Endpoints nuevos
- `POST /organizations/:id/regenerate-token` — Solo OWNER. Body: `{ expelMemberIds?: string[] }`. Genera nuevo UUID, elimina miembros indicados, retorna nuevo token.
- `POST /organizations/join` — Autenticado. Body: `{ token: string }`. Busca org por inviteToken, agrega como VIEWER. Retorna org.

### Endpoints eliminados
- `POST /organizations/:id/invite`
- `POST /organizations/invitations/:token/accept`

### Endpoint modificado
- `GET /organizations/:id` — Incluir `inviteToken` solo si el usuario es OWNER.

## Frontend

### AppLayout.tsx (org switcher)
- Agregar "Unirse a organizacion" al dropdown (icono LoginOutlined)
- Modal con campo "Codigo de invitacion"
- On success: refrescar perfil, cambiar a nueva org, navegar a /dashboard
- Al cambiar de org: invalidar todo el cache de React Query (`queryClient.invalidateQueries()`) y navegar a /dashboard

### Organization.tsx (tab Configuracion)
- Reemplazar modal de invitacion por email con seccion de token:
  - Input readonly + boton "Copiar"
  - Boton "Regenerar token" con modal de checklist de miembros
- Agregar Collapse "Como invitar miembros" con documentacion de 3 pasos
- Eliminar boton "Invitar miembro" y modal de email+rol
- Solo OWNER ve el token y regenerar

### Eliminar
- `InviteMemberDto` del frontend
- Metodos `invite()` de organizations.service.ts
- Modal de invitacion actual

## Roles
- Nuevo miembro entra siempre como VIEWER
- Owner cambia rol desde la tabla de miembros (flujo existente)
- Solo OWNER ve el token y puede regenerar
- OWNER/ADMIN pueden cambiar roles de miembros
