declare module "*.css";
declare module "@fontsource-variable/*";
declare module "*.svg" {
  const url: string;
  export default url;
}
