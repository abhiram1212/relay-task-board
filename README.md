# Relay

Relay is a private Kanban board built with React, TypeScript, Vite, and Supabase. It opens directly into a guest session and stores tasks in Postgres.

## Run locally

Use Node.js 22.12 or later and a running Docker engine. On this machine, the local Supabase environment file has already been configured.

```sh
npm ci
npx supabase start
cp .env.example .env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` using the project URL and publishable key shown by `npx supabase status`. The CLI applies both SQL migrations on the first start. For a running local stack with unapplied migrations, run `npx supabase migration up`.

```sh
npm run dev
```

Open the URL Vite prints. Select **Load example board** on an empty board to add sample tasks, labels, and assignees to that guest session. To try a separate board, open the app in a different browser profile or a private window. A reload in the same browser keeps the guest board. Clearing site data removes access to that guest session.

Use `npm run build` for the production build and `npm run preview` to serve it locally. Use `npx supabase stop` when you are finished with the local backend. This preserves the local database.

## Using the board

- Create a task from the header or any column. Open a card to edit its title, description, priority, due date, or status. The task editor also supports deletion.
- Drag a card by its handle. With a keyboard, focus the handle, press Space, select a column with Left or Right, and press Space to drop. Escape cancels. The task editor's status dropdown provides a second way to move cards.
- Use **Team** and **Labels** to create and remove colored items. Select multiple members and labels in the task editor. Members are assignee records scoped to one guest's board.
- Use **Comments** to add timestamped notes. Use **Activity** to view task creation, status changes, edits, assignments, and label changes.
- Search by title and combine priority, assignee, and label filters. Summary cards count all tasks on the board. Incomplete tasks due within three calendar days are highlighted, and overdue tasks have a separate indicator.

## Data model

The full schema, grants, policies, indexes, and functions are in [supabase/migrations](supabase/migrations). Guest ownership comes from Supabase Auth's `auth.uid()`. Row-level security restricts access to the owner on all seven application tables. Composite foreign keys keep links and comments within the same guest board. The `save_task` RPC writes task fields and links in one transaction. Update timestamps protect edits and moves from overwriting a newer task version. Database triggers record activity in a table that authenticated clients can only read.

The app updates cards on drop and rolls back a failed move. Refresh the board to pull changes made in a different tab. Guest identity is browser-bound, and the board uses creation order within each column.

## Deploy the assessment demo

1. Create a free Supabase project. Apply both migrations in filename order in the SQL Editor or with the Supabase CLI. Enable **Anonymous Sign-Ins** under Authentication. Copy the project URL and publishable key from the Connect dialog. Use a dedicated project for the demo.
2. Push this local Git repository to a GitHub repository you control. Choose the sharing settings you intend for the assessment.
3. Import the repository into a free Vercel project with the **Vite** preset. Use `npm run build` and output directory `dist`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the hosted Supabase project before building. Keep service-role and secret keys out of the browser and repository.
4. Open the deployment in two independent browser profiles. Verify task creation, drag and drop, persistence on refresh, and guest isolation before adding the live and repository links to the submission document.

[Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous) · [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [GitHub import](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github) · [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
