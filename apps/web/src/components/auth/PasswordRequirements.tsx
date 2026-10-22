import { CheckCircle2, XCircle } from "lucide-react";
import { passwordRequirements } from "@/lib/validation/auth";

interface PasswordRequirementsProps {
  password: string;
}

export default function PasswordRequirements({
  password,
}: PasswordRequirementsProps) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-[#59665D]">
        Password must contain:
      </p>

      <ul className="space-y-1.5">
        {passwordRequirements.map((requirement) => {
          const valid = requirement.test(password);

          return (
            <li
              key={requirement.id}
              className="flex items-center gap-2 text-xs"
            >
              {valid ? (
                <CheckCircle2
                  size={15}
                  className="shrink-0 text-green-600"
                  aria-hidden="true"
                />
              ) : (
                <XCircle
                  size={15}
                  className="shrink-0 text-red-500"
                  aria-hidden="true"
                />
              )}

              <span className={valid ? "text-green-700" : "text-[#68746D]"}>
                {requirement.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
