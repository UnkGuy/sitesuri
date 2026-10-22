/** SiteSuri colors applied to Clerk's prebuilt authentication forms. */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#141414",
    colorText: "#141414",
    colorTextSecondary: "#66716C",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#141414",
    colorDanger: "#DC2626",
    borderRadius: "0.85rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full rounded-[22px] border border-[#E3E9E1] bg-white px-5 py-6 shadow-[0_18px_45px_#0000000A] sm:px-8 sm:py-8",
    header: "hidden",
    formButtonPrimary:
      "!bg-[#FACC15] !text-[#141414] !font-bold hover:!bg-[#FDE065] focus-visible:!ring-[#FACC15] shadow-none",
    formFieldInput:
      "!border-[#DBE1DA] !bg-white focus:!border-[#141414] focus:!ring-[#FACC15]",
    formFieldLabel: "!font-semibold !text-[#141414]",
    socialButtonsBlockButton:
      "!border-[#DBE1DA] !bg-white !text-[#141414] hover:!bg-[#F6F7F3]",
    dividerLine: "!bg-[#E5EAE3]",
    dividerText: "!text-[#79857C]",
    formResendCodeLink: "!text-[#15803D]",
    identityPreviewEditButton: "!text-[#15803D]",
  },
};
