//! macOS: medir el notch y subir la ventana del personaje por encima de la barra de menú.

use std::sync::OnceLock;

use objc2::runtime::{AnyClass, AnyObject, Bool, ClassBuilder, Sel};
use objc2::{msg_send, sel};
use objc2_foundation::NSRect;

pub struct PantallaPrincipal {
    /// Marco de la pantalla en coordenadas de AppKit (origen abajo a la izquierda).
    pub marco: NSRect,
    /// Ancho, alto y centro horizontal del notch, si la pantalla tiene uno.
    pub notch: Option<(f64, f64, f64)>,
    /// Alto de la barra de menú, para simular la isla en pantallas sin notch.
    pub alto_barra: f64,
}

/// Lee la pantalla principal (la que tiene la barra de menú). Debe llamarse en el hilo principal.
pub unsafe fn pantalla_principal() -> Option<PantallaPrincipal> {
    let clase = AnyClass::get(c"NSScreen")?;
    let pantallas: *mut AnyObject = msg_send![clase, screens];
    if pantallas.is_null() {
        return None;
    }
    let cantidad: usize = msg_send![&*pantallas, count];
    if cantidad == 0 {
        return None;
    }
    let pantalla: *mut AnyObject = msg_send![&*pantallas, objectAtIndex: 0usize];
    if pantalla.is_null() {
        return None;
    }
    let marco: NSRect = msg_send![&*pantalla, frame];
    let visible: NSRect = msg_send![&*pantalla, visibleFrame];
    let alto_barra = (marco.origin.y + marco.size.height) - (visible.origin.y + visible.size.height);

    // El notch es el hueco entre las dos zonas auxiliares superiores (macOS 12 o superior).
    let mut notch = None;
    let selector = Sel::register(c"auxiliaryTopLeftArea");
    let responde: bool = msg_send![&*pantalla, respondsToSelector: selector];
    if responde {
        let izquierda: NSRect = msg_send![&*pantalla, auxiliaryTopLeftArea];
        let derecha: NSRect = msg_send![&*pantalla, auxiliaryTopRightArea];
        let inicio = izquierda.origin.x + izquierda.size.width;
        let ancho = derecha.origin.x - inicio;
        if izquierda.size.width > 0.0 && ancho > 0.0 {
            notch = Some((ancho, izquierda.size.height, inicio + ancho / 2.0));
        }
    }

    Some(PantallaPrincipal { marco, notch, alto_barra })
}

/// Subclase de NSPanel creada en tiempo de ejecución. Solo un panel "no activador" puede
/// aparecer sobre apps de otros en pantalla completa (así lo hacen Coucou y las apps de notch).
fn clase_panel() -> &'static AnyClass {
    static CLASE: OnceLock<&'static AnyClass> = OnceLock::new();
    CLASE.get_or_init(|| {
        extern "C-unwind" fn si(_: &AnyObject, _: Sel) -> Bool {
            Bool::YES
        }
        extern "C-unwind" fn no(_: &AnyObject, _: Sel) -> Bool {
            Bool::NO
        }
        let padre = AnyClass::get(c"NSPanel").expect("NSPanel no existe");
        let mut clase = ClassBuilder::new(c"PersonajePanel", padre).expect("no se pudo crear PersonajePanel");
        unsafe {
            // Puede recibir teclado (para escribirle al agente) sin volverse ventana principal.
            clase.add_method(sel!(canBecomeKeyWindow), si as extern "C-unwind" fn(_, _) -> _);
            clase.add_method(sel!(canBecomeMainWindow), no as extern "C-unwind" fn(_, _) -> _);
        }
        clase.register()
    })
}

/// Convierte la ventana en panel, la pone sobre la barra de menú, visible en todos los
/// escritorios y sobre apps a pantalla completa, y la ubica en `marco`. Hilo principal.
pub unsafe fn subir_sobre_la_barra(ns_window: *mut std::ffi::c_void, marco: NSRect) {
    let ventana = &*(ns_window as *mut AnyObject);
    AnyObject::set_class(ventana, clase_panel());

    // Panel que no activa la app al hacer clic (NSWindowStyleMaskNonactivatingPanel).
    let estilo: usize = msg_send![ventana, styleMask];
    let _: () = msg_send![ventana, setStyleMask: estilo | (1 << 7)];
    // Los paneles se esconden por defecto cuando la app no está activa; esta nunca lo está.
    let _: () = msg_send![ventana, setHidesOnDeactivate: false];
    let _: () = msg_send![ventana, setFloatingPanel: true];
    let _: () = msg_send![ventana, setBecomesKeyOnlyIfNeeded: true];
    // Por encima de la barra de menú (nivel 24), como hace OC-Claw.
    let _: () = msg_send![ventana, setLevel: 27isize];
    // En todos los escritorios · fija · fuera del ciclo de ventanas · sobre pantalla completa.
    let comportamiento: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
    let _: () = msg_send![ventana, setCollectionBehavior: comportamiento];
    let _: () = msg_send![ventana, setFrame: marco, display: true];
    let _: () = msg_send![ventana, orderFrontRegardless];
}
