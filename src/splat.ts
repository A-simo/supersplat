import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_R32F,
    Asset,
    BoundingBox,
    Entity,
    GSplatData,
    GSplatResource,
    Texture,
    Vec3,
    GraphicsDevice,
    PIXELFORMAT_L8
} from 'playcanvas';
import { Element, ElementType } from "./element";
import { Serializer } from "./serializer";
import { State } from './edit-ops';

const vertexShader = /*glsl*/`

uniform sampler2D splatState;

flat varying highp uint vertexState;

flat varying highp uint splatIndex;
varying vec3 splatCenter;

#ifdef PICK_PASS
flat varying highp uint vertexId;
#endif

void main(void)
{
    // evaluate center of the splat in object space
    vec3 centerLocal = evalCenter();

    // evaluate the rest of the splat using world space center
    vec4 centerWorld = matrix_model * vec4(centerLocal, 1.0);

    gl_Position = evalSplat(centerWorld);

    vertexState = uint(texelFetch(splatState, splatUV, 0).r * 255.0);

    splatIndex = splatId;
    splatCenter = centerLocal;

    #ifdef PICK_PASS
        vertexId = splatId;
    #endif
}
`;

const getFragmentShader = (numSplats: number) => /*glsl*/`

#ifdef PICK_PASS
flat varying highp uint vertexId;
#endif

flat varying highp uint vertexState;
flat varying highp uint splatIndex;
varying vec3 splatCenter;

uniform float pickerAlpha;
uniform float ringSize;
uniform vec3 view_position;

uniform sampler2D fRest0texture;
uniform sampler2D fRest1texture;
uniform sampler2D fRest2texture;
uniform sampler2D fRest3texture;
uniform sampler2D fRest4texture;
uniform sampler2D fRest5texture;
uniform sampler2D fRest6texture;
uniform sampler2D fRest7texture;
uniform sampler2D fRest8texture;

float PI = 3.14159;

void main(void)
{
    if ((vertexState & uint(4)) == uint(4)) {
        // deleted
        discard;
    }

    float A = dot(texCoord, texCoord);
    if (A > 4.0) {
        discard;
    }
    float B = exp(-A) * color.a;
    #ifdef PICK_PASS
        if (B < pickerAlpha ||
            // hidden
            (vertexState & uint(2)) == uint(2)) {
            discard;
        }
        gl_FragColor = vec4(
            float(vertexId & uint(255)) / 255.0,
            float((vertexId >> 8) & uint(255)) / 255.0,
            float((vertexId >> 16) & uint(255)) / 255.0,
            float((vertexId >> 24) & uint(255)) / 255.0
        );
    #else
        vec3 c;
        float alpha;

        if ((vertexState & uint(2)) == uint(2)) {
            // hidden
            c = vec3(0.0, 0.0, 0.0);
            alpha = B * 0.05;
        } else {
            if ((vertexState & uint(1)) == uint(1)) {
                // selected
                c = vec3(1.0, 1.0, 0.0);
            } else {
                // normal
                c = color.xyz;
            }

            alpha = B;

            if (ringSize > 0.0) {
                if (A < 4.0 - ringSize * 4.0) {
                    alpha = max(0.05, B);
                } else {
                    alpha = 0.6;
                }
            }
        } 
        float SH_C1 = 0.94886025119029199;

        // Spherical Harmonics Coefficients
        float sh_r_y_coeff = texture2D(fRest0texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;
        float sh_g_y_coeff = texture2D(fRest1texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;
        float sh_b_y_coeff = texture2D(fRest2texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;

        float sh_r_z_coeff = texture2D(fRest3texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;
        float sh_g_z_coeff = texture2D(fRest4texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;
        float sh_b_z_coeff = texture2D(fRest5texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;

        float sh_r_x_coeff = texture2D(fRest6texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;
        float sh_g_x_coeff = texture2D(fRest7texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;
        float sh_b_x_coeff = texture2D(fRest8texture, vec2(float(splatIndex) / float(${numSplats}), 0.0)).r;
        
        vec3 normalized_direction = normalize(splatCenter - view_position);

        vec3 shFirstOrderCorrection = 
        - SH_C1 * normalized_direction.y * vec3(sh_r_y_coeff, sh_g_y_coeff, sh_b_y_coeff)
        + SH_C1 * normalized_direction.z * vec3(sh_r_z_coeff, sh_g_z_coeff, sh_b_z_coeff)
        - SH_C1 * normalized_direction.x * vec3(sh_r_x_coeff, sh_g_x_coeff, sh_b_x_coeff);

        gl_FragColor = vec4(c + shFirstOrderCorrection, alpha);
    #endif
}
`;

const vec = new Vec3();

class Splat extends Element {
    asset: Asset;
    splatData: GSplatData;
    entity: Entity;
    root: Entity;
    changedCounter = 0;
    stateTexture: Texture;

    constructor(asset: Asset) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatResource;
        const numSplats = splatResource.splatData.numSplats;

        this.asset = asset;
        this.splatData = splatResource.splatData;
        this.entity = new Entity('splatRoot');
        this.root = splatResource.instantiate({
            vertex: vertexShader,
            fragment: getFragmentShader(numSplats)
        });

        // create the state texture
        this.stateTexture = new Texture(splatResource.device, {
            name: 'splatState',
            width: this.root.gsplat.instance.splat.colorTexture.width,
            height: this.root.gsplat.instance.splat.colorTexture.height,
            format: PIXELFORMAT_L8,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        splatResource.device.scope.resolve('splatState').setValue(this.stateTexture);

        // Get 1 order Spherical Harmonics splatData 
        const fRest0 = splatResource.splatData.getProp("f_rest_0");
        const fRest1 = splatResource.splatData.getProp("f_rest_1");
        const fRest2 = splatResource.splatData.getProp("f_rest_2");
        const fRest3 = splatResource.splatData.getProp("f_rest_3");
        const fRest4 = splatResource.splatData.getProp("f_rest_4");
        const fRest5 = splatResource.splatData.getProp("f_rest_5");
        const fRest6 = splatResource.splatData.getProp("f_rest_6");
        const fRest7 = splatResource.splatData.getProp("f_rest_7");
        const fRest8 = splatResource.splatData.getProp("f_rest_8");

        // Wrap Spherical Harmonics data with texture
        const fRest0texture = this.createTextureFromData(splatResource.device, fRest0, numSplats, 1);
        const fRest1texture = this.createTextureFromData(splatResource.device, fRest1, numSplats, 1);
        const fRest2texture = this.createTextureFromData(splatResource.device, fRest2, numSplats, 1);
        const fRest3texture = this.createTextureFromData(splatResource.device, fRest3, numSplats, 1);
        const fRest4texture = this.createTextureFromData(splatResource.device, fRest4, numSplats, 1);
        const fRest5texture = this.createTextureFromData(splatResource.device, fRest5, numSplats, 1);
        const fRest6texture = this.createTextureFromData(splatResource.device, fRest6, numSplats, 1);
        const fRest7texture = this.createTextureFromData(splatResource.device, fRest7, numSplats, 1);
        const fRest8texture = this.createTextureFromData(splatResource.device, fRest8, numSplats, 1);
        
        // Assign Spherical Harmonics Textures for passing to shaders
        splatResource.device.scope.resolve('fRest0texture').setValue(fRest0texture);
        splatResource.device.scope.resolve('fRest1texture').setValue(fRest1texture);
        splatResource.device.scope.resolve('fRest2texture').setValue(fRest2texture);
        splatResource.device.scope.resolve('fRest3texture').setValue(fRest3texture);
        splatResource.device.scope.resolve('fRest4texture').setValue(fRest4texture);
        splatResource.device.scope.resolve('fRest5texture').setValue(fRest5texture);
        splatResource.device.scope.resolve('fRest6texture').setValue(fRest6texture);
        splatResource.device.scope.resolve('fRest7texture').setValue(fRest7texture);
        splatResource.device.scope.resolve('fRest8texture').setValue(fRest8texture);

        console.log({maxTextureSize: splatResource.device.maxTextureSize});
        

        // when sort changes, re-render the scene
        this.root.gsplat.instance.sorter.on('updated', () => {
            this.changedCounter++;
        });

        this.entity.addChild(this.root);
    }

    createTextureFromData(device: GraphicsDevice, data: Float32Array, width: number, height: number) {
        const texture = new Texture(device, {
            width: width,
            height: height,
            format: PIXELFORMAT_R32F,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });

        const textureData = new Float32Array(data);
        texture.lock().set(textureData);
        texture.unlock();

        return texture;
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    updateState(state: Uint8Array) {
        const data = this.stateTexture.lock();
        data.set(state);
        this.stateTexture.unlock();
    }

    get localBound() {
        return this.root.gsplat.instance.splat.aabb;
    }

    get worldBound() {
        return this.root.gsplat.instance.meshInstance.aabb;
    }

    get worldTransform() {
        return this.root.getWorldTransform();
    }

    add() {
        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        const localBound = this.localBound;
        this.entity.setLocalPosition(localBound.center.x, localBound.center.y, localBound.center.z);
        this.root.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);
    }

    remove() {
        this.scene.contentRoot.removeChild(this.entity);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
    }

    calcBound(result: BoundingBox) {
        result.copy(this.worldBound);
        return true;
    }

    // recalculate the local space splat aabb and update engine/root transforms so it
    // remains centered on the splat but doesn't move in world space.
    recalcBound() {
        // it's faster to calculate bound of splat centers
        const state = this.splatData.getProp('state') as Uint8Array;

        const localBound = this.localBound;
        if (!this.splatData.calcAabb(localBound, (i: number) => (state[i] & State.deleted) === 0)) {
            localBound.center.set(0, 0, 0);
            localBound.halfExtents.set(0.5, 0.5, 0.5);
        }

        // calculate meshinstance aabb (transformed local bound)
        const meshInstance = this.root.gsplat.instance.meshInstance;
        meshInstance._aabb.setFromTransformedAabb(localBound, this.entity.getWorldTransform());

        // calculate movement in local space
        vec.add2(this.root.getLocalPosition(), localBound.center);
        this.entity.getWorldTransform().transformVector(vec, vec);
        vec.add(this.entity.getLocalPosition());

        // update transforms so base entity node is oriented to the center of the mesh
        this.entity.setLocalPosition(vec);
        this.root.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);
    }

    focalPoint() {
        return this.asset.resource?.getFocalPoint?.();
    }
}

export { Splat };
