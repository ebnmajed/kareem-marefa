// Which of the scope's two grounds a demo stands on — contract 4, the gallery only.
//
// ★ EVERY DEMO IS RENDERED TWICE ON ONE PAGE, once per ground. A demo that
// names an element id, or a radio group, would name it twice: a label in the
// light ground would focus the control in the dark one, and two radio groups
// with one `name` are one group to the browser, so the first loses its checked
// option. Such a demo takes `ground` and suffixes what it names with it. A demo
// that names nothing takes no prop.
export type DemoGround = "dark" | "light";
