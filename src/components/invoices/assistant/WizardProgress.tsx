import { Check } from "lucide-react";
import { motion } from "framer-motion";

interface WizardProgressProps {
  currentStep: number;
  steps: { number: number; label: string }[];
}

export const WizardProgress = ({ currentStep, steps }: WizardProgressProps) => {
  return (
    <div className="flex items-center justify-between mb-8 px-4">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`
                relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300
                ${
                  currentStep > step.number
                    ? "bg-primary border-primary"
                    : currentStep === step.number
                    ? "bg-primary/10 border-primary"
                    : "bg-background border-border"
                }
              `}
            >
              {currentStep > step.number ? (
                <Check className="w-5 h-5 text-primary-foreground" />
              ) : (
                <span
                  className={`text-sm font-semibold ${
                    currentStep === step.number
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.number}
                </span>
              )}
            </motion.div>
            <span
              className={`mt-2 text-xs font-medium ${
                currentStep >= step.number
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className="flex-1 h-0.5 mx-4 bg-border relative overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: currentStep > step.number ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 bg-primary origin-left"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
