REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE ALL ON FUNCTION public.claim_initial_admin() FROM authenticated;
REVOKE ALL ON FUNCTION public.assert_role(public.app_role[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.add_candidate(text,text,text,text,text[],numeric,numeric,text,date) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_candidate_details(uuid,text,text,text,text[],numeric,numeric,text,date) FROM authenticated;
REVOKE ALL ON FUNCTION public.append_candidate_remark(uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.record_candidate_document(uuid,uuid,text,text,date) FROM authenticated;
REVOKE ALL ON FUNCTION public.assign_candidate_to_project(uuid,uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.change_candidate_stage(uuid,public.candidate_status) FROM authenticated;
REVOKE ALL ON FUNCTION public.set_travel_details(uuid,date,text,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.add_stage_requirement(uuid,public.requirement_stage,text,public.document_category) FROM authenticated;
REVOKE ALL ON FUNCTION public.deactivate_document_type(uuid) FROM authenticated;

DROP POLICY "Staff view own role" ON public.user_roles;
DROP POLICY "Admins assign roles" ON public.user_roles;
DROP POLICY "Admins update roles" ON public.user_roles;
CREATE POLICY "Staff view own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY "Admins create projects" ON public.projects;
DROP POLICY "Admins update projects" ON public.projects;
DROP POLICY "Admins delete projects" ON public.projects;