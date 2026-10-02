//! macOS: medir el notch y subir la ventana del personaje por encima de la barra de menú.

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject, Sel};
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

/// Pone la ventana sobre la barra de menú, visible en todos los escritorios y sobre apps
/// a pantalla completa, y la ubica en `marco`. Debe llamarse en el hilo principal.
pub unsafe fn subir_sobre_la_barra(ns_window: *mut std::ffi::c_void, marco: NSRect) {
    let ventana = &*(ns_window as *mut AnyObject);
    // Por encima de la barra de menú (nivel 24), como hace OC-Claw.
    let _: () = msg_send![ventana, setLevel: 27isize];
    // En todos los escritorios · fija · fuera del ciclo de ventanas · sobre pantalla completa.
    let comportamiento: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
    let _: () = msg_send![ventana, setCollectionBehavior: comportamiento];
    let _: () = msg_send![ventana, setFrame: marco, display: true];
}
