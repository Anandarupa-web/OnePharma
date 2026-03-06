/**
 * ScannerModal.js – Bottom-sheet modal for camera / file-upload flows.
 * Used in both the Patient portal (prescription scan) and Staff POS (OCR).
 *
 * Props:
 *   title          – heading string
 *   mode           – 'patient' | 'staff'
 *   show           – v-model boolean controlling visibility
 *
 * Emits:
 *   update:show    – false when closed
 *   file-selected  – File object when a file is chosen
 *   ocr-done       – array of drug name strings (staff mode only, simulated)
 */
import { defineComponent, ref } from 'vue';

export default defineComponent({
  name: 'ScannerModal',

  props: {
    title: { type: String, default: 'Scan Prescription' },
    mode:  { type: String, default: 'patient' }, // 'patient' | 'staff'
    show:  { type: Boolean, required: true },
  },

  emits: ['update:show', 'file-selected', 'ocr-done'],

  setup(props, { emit }) {
    const processing = ref(false);
    const preview    = ref(null); // base64 preview data-URL
    const fileInput  = ref(null);

    /** Called when the user picks a file. */
    const onFileChange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Build a preview thumbnail
      const reader = new FileReader();
      reader.onload = (ev) => { preview.value = ev.target.result; };
      reader.readAsDataURL(file);

      emit('file-selected', file);

      // Staff mode: simulate OCR processing with a 2-second delay
      if (props.mode === 'staff') {
        processing.value = true;

        // Vary the OCR result slightly using a hash of the file name so repeated
        // uploads of different prescriptions give different-looking extractions.
        const ALL_DRUGS = [
          'Paracetamol 500mg', 'Amoxicillin 250mg', 'Omeprazole 20mg',
          'Metformin 500mg',   'Cetirizine 10mg',   'Ibuprofen 400mg',
          'Azithromycin 500mg','Pantoprazole 40mg', 'Atorvastatin 10mg',
        ];
        const seed = (file.name.length * 7 + file.size) % ALL_DRUGS.length;
        const picked = [
          ALL_DRUGS[seed % ALL_DRUGS.length],
          ALL_DRUGS[(seed + 2) % ALL_DRUGS.length],
          ALL_DRUGS[(seed + 4) % ALL_DRUGS.length],
        ];

        setTimeout(() => {
          processing.value = false;
          emit('ocr-done', picked);
          close();
        }, 2200);
      }
    };

    const triggerFileInput = () => fileInput.value && fileInput.value.click();

    const close = () => {
      if (processing.value) return; // prevent closing while OCR is running
      preview.value = null;
      emit('update:show', false);
    };

    return { processing, preview, fileInput, onFileChange, triggerFileInput, close };
  },

  template: `
    <!-- Backdrop -->
    <Transition name="fade">
      <div
        v-if="show"
        class="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
        @click.self="close"
      >
        <!-- Sheet -->
        <Transition name="slide-up">
          <div
            v-if="show"
            class="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl"
          >
            <!-- Header -->
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-bold text-gray-900">{{ title }}</h2>
              <button
                @click="close"
                :disabled="processing"
                class="text-gray-400 hover:text-gray-600 disabled:opacity-40 text-2xl leading-none"
                aria-label="Close"
              >&times;</button>
            </div>

            <!-- Preview thumbnail -->
            <div
              v-if="preview"
              class="mb-4 rounded-xl overflow-hidden border border-gray-200 max-h-48 flex items-center justify-center bg-gray-50"
            >
              <img :src="preview" alt="Prescription preview" class="object-contain max-h-48" />
            </div>

            <!-- Processing indicator -->
            <div v-if="processing" class="flex flex-col items-center py-6 gap-3">
              <div class="dot-pulse text-green-600">
                <span></span><span></span><span></span>
              </div>
              <p class="text-sm text-gray-500">AI is reading your prescription…</p>
            </div>

            <!-- Actions (hidden while processing) -->
            <div v-else class="space-y-3">
              <!-- Hidden file input using camera capture -->
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden"
                @change="onFileChange"
              />

              <button
                @click="triggerFileInput"
                class="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition"
              >
                <span class="text-lg">📷</span> Open Camera
              </button>

              <!-- Also allow gallery / file picker -->
              <label class="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-green-400 text-gray-600 font-medium py-3 rounded-xl cursor-pointer transition">
                <span class="text-lg">🖼️</span> Upload from Gallery
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="onFileChange"
                />
              </label>

              <p class="text-center text-xs text-gray-400">
                Your prescription is processed locally and never stored on a server.
              </p>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  `,
});
