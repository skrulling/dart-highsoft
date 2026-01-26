-- Allow updating legs (e.g., setting winners) from the client
DROP POLICY IF EXISTS "public update" ON public.legs;
CREATE POLICY "public update" ON public.legs FOR UPDATE USING (true) WITH CHECK (true);
