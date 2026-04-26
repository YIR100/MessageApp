DROP POLICY IF EXISTS "Members can view their conversations" ON public.conversations;

CREATE POLICY "Members can view their conversations"
  ON public.conversations FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = conversations.id
        AND user_id = auth.uid()
    )
  );
