import { CheckoutButtonInitializeOptions, CheckoutButtonOptions } from '../';
import { Checkout, CheckoutActionCreator, CheckoutStore, InternalCheckoutSelectors } from '../../checkout';
import {
    InvalidArgumentError,
    MissingDataError,
    MissingDataErrorType,
    NotInitializedError,
    NotInitializedErrorType
} from '../../common/error/errors';
import { bindDecorator as bind } from '../../common/utility';
import { PaymentMethod } from '../../payment';
import {
    Masterpass,
    MasterpassCheckoutOptions,
    MasterpassScriptLoader
} from '../../payment/strategies/masterpass';

import { CheckoutButtonStrategy, MasterpassButtonInitializeOptions } from './';

export default class MasterpassButtonStrategy extends CheckoutButtonStrategy {
    private _masterpassClient?: Masterpass;
    private _signInButton?: HTMLElement;
    private _stateCheckout?: InternalCheckoutSelectors;
    private _methodId?: string;

    constructor(
        private _store: CheckoutStore,
        private _checkoutActionCreator: CheckoutActionCreator,
        private _masterpassScriptLoader: MasterpassScriptLoader
    ) {
        super();
    }

    initialize(options: CheckoutButtonInitializeOptions): Promise<void> {
        const { masterpass: masterpassOptions, methodId } = options;

        if (!masterpassOptions || !methodId) {
            throw new InvalidArgumentError('Unable to proceed because "options.masterpass" argument is not provided.');
        }
        this._methodId = methodId;

        if (this._isInitialized) {
            return super.initialize(options);
        }

        return this._store.dispatch(this._checkoutActionCreator.loadDefaultCheckout())
        .then(stateCheckout => {
                this._stateCheckout = stateCheckout;

                return this._masterpassScriptLoader.load(this._getPaymentMethod().config.testMode)
                    .then(masterpass => {
                        this._masterpassClient = masterpass;
                        this._createSignInButton(masterpassOptions);
                    });
        })
        .then(() => super.initialize(options));
    }

    deinitialize(options: CheckoutButtonOptions): Promise<void> {
        if (!this._isInitialized) {
            return super.deinitialize(options);
        }

        if (this._signInButton && this._signInButton.parentNode) {
            this._signInButton.removeEventListener('click', this._handleWalletButtonClick);
            this._signInButton.parentNode.removeChild(this._signInButton);
            this._signInButton = undefined;
        }

        return super.deinitialize(options);
    }

    private _createSignInButton(masterpassOptions: MasterpassButtonInitializeOptions): void {
        const { container } = masterpassOptions;
        const buttonContainer = document.querySelector(`#${container}`);

        if (!buttonContainer) {
            throw new Error('Need a container to place the button');
        }

        const button = document.createElement('input');

        button.type = 'image';
        button.src = 'https://static.masterpass.com/dyn/img/btn/global/mp_chk_btn_160x037px.svg';
        buttonContainer.appendChild(button);
        this._signInButton = button;
        this._signInButton.addEventListener('click', this._handleWalletButtonClick);
    }

    private _createMasterpassPayload(): MasterpassCheckoutOptions {
        const paymentMethod = this._getPaymentMethod();
        const checkout = this._getCheckout();

        return {
            checkoutId: paymentMethod.initializationData.checkoutId,
            allowedCardTypes: paymentMethod.initializationData.allowedCardTypes,
            amount: checkout.cart.cartAmount.toString(),
            currency: checkout.cart.currency.code,
            cartId: checkout.cart.id,
            suppressShippingAddress: true,
        };
    }

    @bind
    private _handleWalletButtonClick(): void  {
        const payload = this._createMasterpassPayload();
        this._getMasterpassClient().checkout(payload);
    }

    private _getMasterpassClient(): Masterpass {
        if (!this._masterpassClient) {
            throw new NotInitializedError(NotInitializedErrorType.CheckoutButtonNotInitialized);
        }

        return this._masterpassClient;
    }

    private _getPaymentMethod(): PaymentMethod {
        if (!this._methodId) {
            throw new InvalidArgumentError();
        }

        if (!this._stateCheckout) {
            throw new MissingDataError(MissingDataErrorType.MissingCheckout);
        }

        const paymentMethod = this._stateCheckout.paymentMethods.getPaymentMethod(this._methodId);
        if (!paymentMethod || !paymentMethod.initializationData.checkoutId) {
            throw new MissingDataError(MissingDataErrorType.MissingPaymentMethod);
        }

        return paymentMethod;
    }

    private _getCheckout(): Checkout {
        if (!this._stateCheckout) {
            throw new MissingDataError(MissingDataErrorType.MissingCheckout);
        }

        const checkout = this._stateCheckout.checkout.getCheckout();
        if (!checkout || !checkout.cart.id) {
            throw new MissingDataError(MissingDataErrorType.MissingCheckout);
        }

        return checkout;
    }

}
