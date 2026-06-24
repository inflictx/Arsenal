// Type declaration for the vendored reverse-shell-generator data (rsg-data.js is copied
// verbatim from 0dayCTF/reverse-shell-generator and appends `export { rsgData, CommandType }`).
export const CommandType: {
  ReverseShell: string;
  BindShell: string;
  MSFVenom: string;
  HoaxShell: string;
  Assembled: string;
};

export const rsgData: {
  reverseShellCommands: { name: string; command: string; meta: string[] }[];
  listenerCommands: [string, string][];
  shells: string[];
};
