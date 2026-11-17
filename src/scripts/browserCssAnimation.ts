let _supportsCssAnimation: boolean | undefined;
let _supportsCssAnimationWithPrefix: boolean | undefined;
export default function supportsCssAnimation(allowPrefix?: boolean) {
    // TODO: Assess if this is still needed, as all of our targets should natively support CSS animations.
    if (allowPrefix && (_supportsCssAnimationWithPrefix === true || _supportsCssAnimationWithPrefix === false)) {
        return _supportsCssAnimationWithPrefix;
    }
    if (_supportsCssAnimation === true || _supportsCssAnimation === false) {
        return _supportsCssAnimation;
    }

    let animation = false;
    const animationNames = ['WebkitAnimationName', 'OAnimationName', 'MozAnimationName'] as const;
    const elm = document.createElement('div');

    // eslint-disable-next-line sonarjs/different-types-comparison
    if (elm.style.animationName !== undefined) {
        animation = true;
    }

    if (animation === false && allowPrefix) {
        for (const animationName of animationNames) {
            if ((elm.style as CSSStyleDeclaration & Partial<Record<typeof animationName, string>>)[animationName] !== undefined) {
                animation = true;
                break;
            }
        }
    }

    if (allowPrefix) {
        _supportsCssAnimationWithPrefix = animation;
        return _supportsCssAnimationWithPrefix;
    } else {
        _supportsCssAnimation = animation;
        return _supportsCssAnimation;
    }
}

