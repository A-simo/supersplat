# Implementation of First Level Spherical Harmonics displaying
This repository, based on a fork of [SuperSplat](https://github.com/playcanvas/supersplat), contains the implementation of  1 level Spherical Harmonics for 3D Gaussian Splatting.

The original task is as follows:

> **Spherical Harmonic View**
> SuperSplat loads SH data but does not use it for rendering. Fix this by altering the shader code to properly display SH level 1 data.

### Implementation flow:

1) The first step was to understand the structure of the `.ply` file and the concept of Spherical Harmonics.
The intuitive understanding formed as follows: among other data, the `.ply` file can contain coefficients of Spherical Harmonics of different levels for color correction depending on the viewing angle. This provides the ability to convey lighting and reflection characteristics. However, this comes at a cost - Spherical Harmonics data takes up a significant portion of the `.ply` file and affects the file size. Therefore, various editors and viewers offer the option to disable loading additional data, including PlayCanvas's SuperSplat.

2) Analysis of the PlayCanvas engine code showed that when parsing `.ply` files, it does not transmit data on Spherical Harmonics of level 1 and higher, only `f_dc_0`, `f_dc_1`, and `f_dc_2` for fragment color rendering. Therefore, one of the tasks of this implementation was to pass the 1 level Spherical Harmonics coefficients (`f_rest_0` to `f_rest_8`) to the shader for further processing.

3) To display 1 level Spherical Harmonics, 9 coefficients are sufficient: `r`, `g`, and `b` channels for `x`, `y`, and `z`. In this implementation, textures are used to pass this data. However, they have a limitation on the amount of data that can be transferred. One possible solution in future iterations might be to use SSBO (Shader Storage Buffer Object) or to split textures into parts that do not exceed 'The maximum supported dimension of a texture' for the device in use. Alternatively, changes could be made to the PlayCanvas engine to extract this data from the `.ply` file along with other parameters (position, scale, color, etc.).

Thus, 1 level Spherical Harmonics display was implemented for scenes with a limited number of splats. When loading a `.ply` file, the console displays the allowable number of data `maxTextureSize` that can be transmitted in a texture. In my case, the allowable texture length was '16384'. Therefore, to work with this implementation, `.ply` files with no more than this number of splats should be used. However, this limitation can be bypassed in future iterations.

### Steps to reproduce:
1) Download this repository, install all dependencies, and run it as indicated in `README.md`.
2) Download the test file `robo_body.ply` located at the root of the repository.
3) Load the test file into the viewer. (! Do not deactivate the "Load all PLY data" option.)

Now, 1 level Spherical Harmonics will be available when viewing the model. However, it is difficult to notice the difference between the presence and absence of this information.

4) For a rough test, we can try changing the value of one of the coefficients. This will change the color of the entire model depending on the viewing angle.
Find the following code in the splats.ts file:
`- SH_C1 * normalized_direction.x * vec3(sh_r_x_coeff, sh_g_x_coeff, sh_b_x_coeff);`
And replace it with:
`- SH_C1 * normalized_direction.x * vec3(0.2, sh_g_x_coeff, sh_b_x_coeff);`
Applying changes may take some time, so it may require 1-2 page reloads and file loads to see the changes made.

Now, when changing the viewing angle, the model will noticeably change its shade. This will show that the shader for harmonics display works. But real data may have little effect on the final result.

### Limitations and future steps:
1. The ability to pass larger amounts of data to the shader. For testing the implementation, we can use the file included in this repository. The current implementation does not allow loading large scenes containing hundreds of thousands of splats. However, this is a solvable issue for further iterations.
2. Error handling when accessing a non-existent array element and other cases of receiving incorrect spherical harmonics data.
3. Modifying the shader based on the "Load all `.ply` data" parameter. This limitation is a continuation of the previous point. If not all data is passed to the shader, an error will occur due to accessing an undefined value, and the fragment shader will not render the color.

### Sources:
1. Understanding how Spherical Harmonics are stored in `.ply` files: https://medium.com/xrlo-extended-reality-lowdown/how-we-wrote-a-gpu-based-gaussian-splats-viewer-in-unreal-with-niagara-7457f6f0f640
2. Logic for applying Spherical Harmonics coefficients: https://github.com/graphdeco-inria/gaussian-splatting