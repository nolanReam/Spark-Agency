import { createStaffSignupHandler } from "../_shared/staffSignup.ts";

Deno.serve(createStaffSignupHandler({
  role: "instructor",
  accessCodeSecretName: "INSTRUCTOR_SIGNUP_CODE",
}));
