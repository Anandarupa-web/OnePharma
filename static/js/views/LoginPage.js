/**
 * LoginPage.js – Staff / Admin Login
 *
 * Shown automatically when a guest tries to navigate to the Staff POS or
 * Admin Dashboard.  Uses `inject('handleLogin')` (provided by app.js) to
 * update the global auth state and redirect to the intended portal.
 *
 * Credentials are validated client-side against the op_staff localStorage
 * table – a pure simulation.  In Phase 2 this will be a POST /api/auth/login.
 */
import { defineComponent, ref, inject } from 'vue';
import { getStaff } from '../app.js';

export default defineComponent({
  name: 'LoginPage',

  setup() {
    // Injected from app.js root component
    const handleLogin  = inject('handleLogin');
    const switchView   = inject('switchView');

    // ── Form state ────────────────────────────────────────────────────────
    const email    = ref('');
    const password = ref('');
    const showPwd  = ref(false);
    const error    = ref('');
    const loading  = ref(false);

    // ── Demo credentials shown to the tester ─────────────────────────────
    // Hierarchy: app_admin (OnePharma devs) > pharmacist (pharmacy owner) > staff (employees)
    const demoCreds = [
      { role: 'App Admin',       email: 'admin@onepharma.com', password: 'appadmin123', badge: 'bg-purple-100 text-purple-700', hint: '→ OnePharma Admin Dashboard' },
      { role: 'Pharmacy Owner',  email: 'owner@saha.com',      password: 'owner123',    badge: 'bg-indigo-100 text-indigo-700', hint: '→ Saha Pharmacy Dashboard'    },
      { role: 'Staff',           email: 'raj@saha.com',        password: 'pass123',     badge: 'bg-green-100 text-green-700',  hint: '→ Staff POS'                  },
      { role: 'Doctor',          email: 'mehta@clinic.com',    password: 'doc123',      badge: 'bg-blue-100 text-blue-700',    hint: '→ Doctor Dashboard'           },
    ];

    /** Fill form with a demo credential on click. */
    const fillDemo = (cred) => {
      email.value    = cred.email;
      password.value = cred.password;
      error.value    = '';
    };

    /** Validate credentials against the local staff table. */
    const submit = () => {
      error.value   = '';
      loading.value = true;

      // Simulate a brief network delay for realism
      setTimeout(() => {
        loading.value = false;

        const staff = getStaff();
        // NOTE: Plain-text password comparison is intentional for this Phase 1
        // client-side simulation.  In Phase 2 this will be replaced by a secure
        // POST /api/auth/login endpoint that compares bcrypt-hashed passwords
        // server-side and returns a signed JWT – passwords will never travel in
        // plain text or be stored unhashed.
        const user  = staff.find(
          (s) => s.email === email.value.trim().toLowerCase() &&
                 s.password === password.value &&
                 s.active
        );

        if (!user) {
          error.value = 'Invalid email or password, or your account is inactive.';
          return;
        }

        // Pass the full user record (handleLogin strips the password before storing)
        handleLogin(user);
      }, 600);
    };

    return {
      email, password, showPwd, error, loading,
      demoCreds, fillDemo, submit,
      switchView,
    };
  },

  template: `
    <div class="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-green-50 to-teal-50 flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-md">

        <!-- Card -->
        <div class="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          <!-- Card header -->
          <div class="bg-green-600 px-6 py-5 text-white">
            <div class="flex items-center gap-3">
              <span class="text-4xl">💊</span>
              <div>
                <h1 class="text-xl font-bold">OnePharma Portal Login</h1>
                <p class="text-green-100 text-sm">App Admin · Pharmacy Owner · Staff · Doctor</p>
              </div>
            </div>
          </div>

          <!-- Form body -->
          <div class="px-6 py-6">

            <!-- Error banner -->
            <div
              v-if="error"
              class="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2"
            >
              <span>⚠️</span> {{ error }}
            </div>

            <!-- Email field -->
            <label class="block mb-4">
              <span class="text-sm font-medium text-gray-700">Email address</span>
              <input
                v-model="email"
                type="email"
                placeholder="you@saha.com"
                autocomplete="email"
                @keyup.enter="submit"
                class="mt-1 block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-3 text-sm outline-none transition bg-white"
              />
            </label>

            <!-- Password field -->
            <label class="block mb-5">
              <span class="text-sm font-medium text-gray-700">Password</span>
              <div class="relative mt-1">
                <input
                  v-model="password"
                  :type="showPwd ? 'text' : 'password'"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  @keyup.enter="submit"
                  class="block w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-3 text-sm outline-none transition bg-white pr-12"
                />
                <button
                  type="button"
                  @click="showPwd = !showPwd"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg"
                  :aria-label="showPwd ? 'Hide password' : 'Show password'"
                >
                  {{ showPwd ? '🙈' : '👁️' }}
                </button>
              </div>
            </label>

            <!-- Submit button -->
            <button
              @click="submit"
              :disabled="loading || !email || !password"
              class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 flex items-center justify-center gap-2"
            >
              <span v-if="loading" class="dot-pulse text-white">
                <span></span><span></span><span></span>
              </span>
              <span v-else>Login →</span>
            </button>

            <!-- Back to patient link -->
            <p class="text-center text-xs text-gray-400 mt-4">
              Not a staff member?
              <button
                @click="switchView('PatientHome')"
                class="text-green-600 hover:text-green-700 font-medium underline"
              >Browse as Patient</button>
            </p>
          </div>
        </div>

        <!-- Demo credentials panel -->
        <div class="mt-5 bg-white rounded-2xl shadow border border-gray-100 px-5 py-4">
          <p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
            🧪 Demo Credentials (click to fill)
          </p>
          <div class="space-y-2">
            <button
              v-for="cred in demoCreds"
              :key="cred.email"
              @click="fillDemo(cred)"
              class="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-xl px-4 py-2.5 text-left transition"
            >
              <div class="flex-1 min-w-0">
                <span :class="['text-xs px-2 py-0.5 rounded font-semibold', cred.badge]">{{ cred.role }}</span>
                <p class="text-xs text-gray-500 mt-0.5 truncate">{{ cred.email }}</p>
                <p v-if="cred.hint" class="text-[10px] text-gray-400 mt-0.5">{{ cred.hint }}</p>
              </div>
              <span class="text-xs text-gray-400 font-mono ml-2 shrink-0">{{ cred.password }}</span>
            </button>
          </div>
          <p class="text-[10px] text-gray-400 mt-3 text-center">
            Inactive accounts are rejected even with the correct password.
          </p>
        </div>

      </div>
    </div>
  `,
});
