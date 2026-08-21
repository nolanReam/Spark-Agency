import { createStaffSignupHandler } from "../_shared/staffSignup.ts";

Deno.serve(createStaffSignupHandler({
  role: "volunteer",
  accessCodeSecretName: "VOLUNTEER_SIGNUP_CODE",
}));
